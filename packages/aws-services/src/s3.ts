/**
 * AWS S3 — Object storage for voice recordings, clinical documents, medical images.
 *
 * Provides upload, download, presigned URL generation, and lifecycle management.
 * Falls back to local filesystem storage in development mode.
 */

import { getAwsConfig, isServiceAvailable } from './config';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface S3UploadResult {
  bucket: string;
  key: string;
  etag?: string;
  versionId?: string;
  location: string;
}

export interface S3PresignedUrlResult {
  url: string;
  expiresAt: string;
  bucket: string;
  key: string;
}

export interface S3ListResult {
  key: string;
  size: number;
  lastModified: string;
  etag?: string;
}

export type S3BucketType = 'voice-recordings' | 'clinical-documents' | 'medical-images';

// ─── Bucket Resolution ──────────────────────────────────────────────────────

function getBucketName(type: S3BucketType): string {
  const config = getAwsConfig();
  const prefix = config.resourcePrefix;
  const env = config.isProduction ? 'prod' : 'dev';

  switch (type) {
    case 'voice-recordings':
      return process.env.S3_VOICE_BUCKET || `${prefix}-${env}-voice-recordings`;
    case 'clinical-documents':
      return process.env.S3_DOCUMENTS_BUCKET || `${prefix}-${env}-clinical-documents`;
    case 'medical-images':
      return process.env.S3_IMAGES_BUCKET || `${prefix}-${env}-medical-images`;
  }
}

// ─── Lazy SDK loader ────────────────────────────────────────────────────────

let _s3Client: any = null;

async function getS3Client(): Promise<any> {
  if (_s3Client) return _s3Client;

  const config = getAwsConfig();
  const { S3Client: S3Cls } = await import('@aws-sdk/client-s3');
  _s3Client = new S3Cls({ region: config.region });
  return _s3Client;
}

// ─── Local fallback storage (dev mode) ──────────────────────────────────────

const _localStore = new Map<string, { data: Buffer; contentType: string; metadata: Record<string, string> }>();

// ─── Upload ─────────────────────────────────────────────────────────────────

/**
 * Upload a file to S3 with server-side encryption.
 */
export async function uploadObject(
  bucketType: S3BucketType,
  key: string,
  body: Buffer | Uint8Array | string,
  options: {
    contentType?: string;
    metadata?: Record<string, string>;
    kmsKeyId?: string;
  } = {},
): Promise<S3UploadResult> {
  const bucket = getBucketName(bucketType);
  const contentType = options.contentType || 'application/octet-stream';

  if (!isServiceAvailable('s3')) {
    // Dev fallback: store in memory
    const buf = typeof body === 'string' ? Buffer.from(body) : Buffer.from(body);
    _localStore.set(`${bucket}/${key}`, {
      data: buf,
      contentType,
      metadata: options.metadata || {},
    });

    console.log(`[S3-Dev] Stored ${bucket}/${key} (${buf.length} bytes)`);
    return {
      bucket,
      key,
      etag: '"dev-etag"',
      location: `s3://${bucket}/${key}`,
    };
  }

  const client = await getS3Client();
  const { PutObjectCommand } = await import('@aws-sdk/client-s3');

  const params: Record<string, unknown> = {
    Bucket: bucket,
    Key: key,
    Body: body,
    ContentType: contentType,
    ServerSideEncryption: 'aws:kms',
    Metadata: options.metadata || {},
  };

  if (options.kmsKeyId || process.env.KMS_KEY_ID) {
    params.SSEKMSKeyId = options.kmsKeyId || process.env.KMS_KEY_ID;
  }

  const result = await client.send(new PutObjectCommand(params as any));

  return {
    bucket,
    key,
    etag: result.ETag,
    versionId: result.VersionId,
    location: `s3://${bucket}/${key}`,
  };
}

// ─── Download ───────────────────────────────────────────────────────────────

/**
 * Download an object from S3.
 */
export async function downloadObject(
  bucketType: S3BucketType,
  key: string,
): Promise<{ body: Buffer; contentType: string; metadata: Record<string, string> }> {
  const bucket = getBucketName(bucketType);

  if (!isServiceAvailable('s3')) {
    const stored = _localStore.get(`${bucket}/${key}`);
    if (!stored) {
      throw new Error(`Object not found: ${bucket}/${key}`);
    }
    return { body: stored.data, contentType: stored.contentType, metadata: stored.metadata };
  }

  const client = await getS3Client();
  const { GetObjectCommand } = await import('@aws-sdk/client-s3');

  const result = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  const chunks: Uint8Array[] = [];
  for await (const chunk of result.Body) {
    chunks.push(chunk);
  }

  return {
    body: Buffer.concat(chunks),
    contentType: result.ContentType || 'application/octet-stream',
    metadata: result.Metadata || {},
  };
}

// ─── Presigned URLs ─────────────────────────────────────────────────────────

/**
 * Generate a presigned URL for downloading an object.
 */
export async function getPresignedDownloadUrl(
  bucketType: S3BucketType,
  key: string,
  expiresInSeconds: number = 3600,
): Promise<S3PresignedUrlResult> {
  const bucket = getBucketName(bucketType);
  const expiresAt = new Date(Date.now() + expiresInSeconds * 1000).toISOString();

  if (!isServiceAvailable('s3')) {
    return {
      url: `http://localhost:4566/${bucket}/${key}?X-Amz-Expires=${expiresInSeconds}`,
      expiresAt,
      bucket,
      key,
    };
  }

  const client = await getS3Client();
  const { GetObjectCommand } = await import('@aws-sdk/client-s3');
  const { getSignedUrl } = await import('@aws-sdk/s3-request-presigner');

  const url = await getSignedUrl(
    client,
    new GetObjectCommand({ Bucket: bucket, Key: key }),
    { expiresIn: expiresInSeconds },
  );

  return { url, expiresAt, bucket, key };
}

/**
 * Generate a presigned URL for uploading an object.
 */
export async function getPresignedUploadUrl(
  bucketType: S3BucketType,
  key: string,
  contentType: string = 'application/octet-stream',
  expiresInSeconds: number = 3600,
): Promise<S3PresignedUrlResult> {
  const bucket = getBucketName(bucketType);
  const expiresAt = new Date(Date.now() + expiresInSeconds * 1000).toISOString();

  if (!isServiceAvailable('s3')) {
    return {
      url: `http://localhost:4566/${bucket}/${key}?X-Amz-Expires=${expiresInSeconds}`,
      expiresAt,
      bucket,
      key,
    };
  }

  const client = await getS3Client();
  const { PutObjectCommand } = await import('@aws-sdk/client-s3');
  const { getSignedUrl } = await import('@aws-sdk/s3-request-presigner');

  const url = await getSignedUrl(
    client,
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      ContentType: contentType,
      ServerSideEncryption: 'aws:kms',
    }),
    { expiresIn: expiresInSeconds },
  );

  return { url, expiresAt, bucket, key };
}

// ─── List Objects ───────────────────────────────────────────────────────────

/**
 * List objects in a bucket under a given prefix.
 */
export async function listObjects(
  bucketType: S3BucketType,
  prefix: string,
  maxKeys: number = 100,
): Promise<S3ListResult[]> {
  const bucket = getBucketName(bucketType);

  if (!isServiceAvailable('s3')) {
    const results: S3ListResult[] = [];
    const fullPrefix = `${bucket}/${prefix}`;
    for (const [k, v] of _localStore.entries()) {
      if (k.startsWith(fullPrefix)) {
        results.push({
          key: k.replace(`${bucket}/`, ''),
          size: v.data.length,
          lastModified: new Date().toISOString(),
        });
      }
    }
    return results;
  }

  const client = await getS3Client();
  const { ListObjectsV2Command } = await import('@aws-sdk/client-s3');

  const result = await client.send(new ListObjectsV2Command({
    Bucket: bucket,
    Prefix: prefix,
    MaxKeys: maxKeys,
  }));

  return (result.Contents || []).map((obj: any) => ({
    key: obj.Key!,
    size: obj.Size!,
    lastModified: obj.LastModified!.toISOString(),
    etag: obj.ETag,
  }));
}

// ─── Delete ─────────────────────────────────────────────────────────────────

/**
 * Delete an object from S3.
 */
export async function deleteObject(
  bucketType: S3BucketType,
  key: string,
): Promise<void> {
  const bucket = getBucketName(bucketType);

  if (!isServiceAvailable('s3')) {
    _localStore.delete(`${bucket}/${key}`);
    return;
  }

  const client = await getS3Client();
  const { DeleteObjectCommand } = await import('@aws-sdk/client-s3');

  await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
}

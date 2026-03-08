export const config = {
  port: parseInt(process.env.PORT || '8004', 10),
  env: process.env.NODE_ENV || 'development',

  livekit: {
    host: process.env.LIVEKIT_URL || 'http://livekit:7880',
    wsUrl: process.env.LIVEKIT_WS_URL || 'ws://localhost:7880',
    apiKey: process.env.LIVEKIT_API_KEY || '',
    apiSecret: process.env.LIVEKIT_API_SECRET || '',
  },

  aws: {
    region: process.env.AWS_REGION || 'ap-south-1',
    transcribeLanguage: process.env.TRANSCRIBE_LANGUAGE || 'hi-IN',
    recordingBucket: process.env.RECORDING_S3_BUCKET || 'vaidyah-recordings-dev',
  },

  jwt: {
    secret: (() => {
      const secret = process.env.JWT_SECRET;
      if (!secret) throw new Error('JWT_SECRET environment variable is required');
      return secret;
    })(),
  },

  cors: {
    origins: (process.env.CORS_ORIGINS || 'http://localhost:3001,http://localhost:5173').split(','),
  },
};

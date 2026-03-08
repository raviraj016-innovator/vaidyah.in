'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import {
  App,
  Card,
  Row,
  Col,
  Typography,
  Space,
  Tag,
  Button,
  Badge,
  Drawer,
  Tooltip,
  Descriptions,
  Divider,
  Empty,
  Spin,
  Alert,
} from 'antd';
import {
  AudioOutlined,
  AudioMutedOutlined,
  VideoCameraOutlined,
  VideoCameraAddOutlined,
  PhoneOutlined,
  UserOutlined,
  WifiOutlined,
  DisconnectOutlined,
  ExpandOutlined,
  CompressOutlined,
  ReloadOutlined,
  InfoCircleOutlined,
  HeartOutlined,
  MedicineBoxOutlined,
} from '@ant-design/icons';
import {
  Room,
  RoomEvent,
  Track,
  ConnectionState,
  RemoteParticipant,
  RemoteTrackPublication,
  LocalTrackPublication,
} from 'livekit-client';
import { useTranslation } from '@/lib/i18n/use-translation';
import { useSessionStore } from '@/stores/session-store';
import { useAuthStore } from '@/stores/auth-store';
import { PageHeader } from '@/components/ui/page-header';
import api from '@/lib/api/client';
import endpoints from '@/lib/api/endpoints';

const { Text, Paragraph } = Typography;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TranscriptSegment {
  id: string;
  speaker: string;
  text: string;
  timestamp: string;
  isFinal: boolean;
}

interface MeetingResponse {
  token: string;
  meetingId: string;
  livekitUrl: string;
}

type ViewConnectionState =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'failed';


// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const CONNECTION_BADGE: Record<ViewConnectionState, string> = {
  disconnected: 'default',
  connecting: 'processing',
  connected: 'success',
  reconnecting: 'warning',
  failed: 'error',
};

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString('en-IN', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return '';
  }
}

function mapLkState(s: ConnectionState): ViewConnectionState {
  switch (s) {
    case ConnectionState.Connected:
      return 'connected';
    case ConnectionState.Connecting:
      return 'connecting';
    case ConnectionState.Reconnecting:
      return 'reconnecting';
    case ConnectionState.Disconnected:
    default:
      return 'disconnected';
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function TelemedicinePage() {
  const router = useRouter();
  const params = useParams();
  const consultationId = Array.isArray(params.consultationId)
    ? (params.consultationId[0] ?? '')
    : (params.consultationId ?? '');
  const { language } = useTranslation();
  const { message, modal } = App.useApp();

  const patient = useSessionStore((s) => s.patient);
  const vitals = useSessionStore((s) => s.vitals);
  const user = useAuthStore((s) => s.user);

  // ---- connection & media state ----
  const [connState, setConnState] = useState<ViewConnectionState>('disconnected');
  const [isAudioOn, setIsAudioOn] = useState(true);
  const [isVideoOn, setIsVideoOn] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [initLoading, setInitLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [remoteJoined, setRemoteJoined] = useState(false);

  // ---- transcription state ----
  const [transcript, setTranscript] = useState<TranscriptSegment[]>([]);

  // ---- patient info drawer ----
  const [drawerOpen, setDrawerOpen] = useState(false);

  // ---- refs ----
  const roomRef = useRef<Room | null>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const transcriptEndRef = useRef<HTMLDivElement>(null);

  // --------------------------------------------------------------------------
  // Fetch meeting token (POST /telemedicine/meetings)
  // --------------------------------------------------------------------------
  const fetchMeetingToken = useCallback(async (): Promise<MeetingResponse | null> => {
    try {
      const { data } = await api.post<MeetingResponse>(
        endpoints.telemedicine.createMeeting,
        { consultationId },
      );
      return data;
    } catch (err) {
      console.error('Failed to fetch meeting token:', err);
      return null;
    }
  }, [consultationId]);

  // --------------------------------------------------------------------------
  // Attach a remote participant's video track to our <video> element
  // --------------------------------------------------------------------------
  const attachRemoteTrack = useCallback(
    (
      track: RemoteTrackPublication['track'],
      _publication: RemoteTrackPublication,
      _participant: RemoteParticipant,
    ) => {
      if (!track) return;
      if (track.kind === Track.Kind.Video && track.source === Track.Source.Camera) {
        if (remoteVideoRef.current) {
          track.attach(remoteVideoRef.current);
        }
        setRemoteJoined(true);
      } else if (track.kind === Track.Kind.Audio) {
        // Audio tracks need a DOM element to play
        const el = track.attach();
        document.body.appendChild(el);
      }
    },
    [],
  );

  // --------------------------------------------------------------------------
  // Connect to LiveKit room
  // --------------------------------------------------------------------------
  const connectRoom = useCallback(
    async (livekitUrl: string, token: string) => {
      setConnState('connecting');
      setErrorMsg(null);

      const room = new Room({
        adaptiveStream: true,
        dynacast: true,
      });

      roomRef.current = room;

      // --- Room events ---

      room.on(RoomEvent.ConnectionStateChanged, (state: ConnectionState) => {
        setConnState(mapLkState(state));
      });

      room.on(RoomEvent.Connected, () => {
        setConnState('connected');
        message.success(
          language === 'hi' ? 'कॉल से जुड़ गए' : 'Connected to call',
        );
      });

      room.on(RoomEvent.Disconnected, () => {
        setConnState('disconnected');
        setRemoteJoined(false);
      });

      room.on(RoomEvent.Reconnecting, () => setConnState('reconnecting'));
      room.on(RoomEvent.Reconnected, () => setConnState('connected'));

      // Remote tracks
      room.on(
        RoomEvent.TrackSubscribed,
        (track, publication, participant) => {
          attachRemoteTrack(track, publication as RemoteTrackPublication, participant as RemoteParticipant);
        },
      );

      room.on(RoomEvent.TrackUnsubscribed, (track) => {
        track.detach().forEach((el) => el.remove());
      });

      // Local camera track published -- attach to PiP
      room.on(
        RoomEvent.LocalTrackPublished,
        (publication: LocalTrackPublication) => {
          const track = publication.track;
          if (
            track &&
            track.kind === Track.Kind.Video &&
            track.source === Track.Source.Camera &&
            localVideoRef.current
          ) {
            track.attach(localVideoRef.current);
          }
        },
      );

      // Remote participant joined / left
      room.on(RoomEvent.ParticipantConnected, (p: RemoteParticipant) => {
        setRemoteJoined(true);
        message.info(
          language === 'hi'
            ? `${p.identity} कॉल में शामिल हुए`
            : `${p.identity} joined the call`,
        );
      });

      room.on(RoomEvent.ParticipantDisconnected, (p: RemoteParticipant) => {
        setRemoteJoined(false);
        message.info(
          language === 'hi'
            ? `${p.identity} ने कॉल छोड़ दी`
            : `${p.identity} left the call`,
        );
      });

      // Connect
      await room.connect(livekitUrl, token);

      // Publish camera + mic
      await room.localParticipant.enableCameraAndMicrophone();

      // Attach local camera preview
      const camPub = room.localParticipant.getTrackPublication(Track.Source.Camera);
      if (camPub?.track && localVideoRef.current) {
        camPub.track.attach(localVideoRef.current);
      }
    },
    [language, message, attachRemoteTrack],
  );

  // --------------------------------------------------------------------------
  // Initialization: fetch token and connect to LiveKit
  // --------------------------------------------------------------------------
  useEffect(() => {
    let cancelled = false;

    (async () => {
      setInitLoading(true);
      const meeting = await fetchMeetingToken();

      if (cancelled) return;

      if (!meeting) {
        setConnState('failed');
        setErrorMsg(
          language === 'hi'
            ? 'मीटिंग टोकन प्राप्त करने में विफल। टेलीमेडिसिन सेवा अनुपलब्ध हो सकती है।'
            : 'Failed to fetch meeting token. The telemedicine service may be unavailable.',
        );
        setInitLoading(false);
        return;
      }

      const { livekitUrl, token } = meeting;

      // If no LiveKit URL, show error
      if (!livekitUrl) {
        setConnState('failed');
        setErrorMsg(
          language === 'hi'
            ? 'LiveKit URL कॉन्फ़िगर नहीं किया गया है। कृपया व्यवस्थापक से संपर्क करें।'
            : 'LiveKit URL not configured. Please contact your administrator.',
        );
        setInitLoading(false);
        return;
      }

      // Real LiveKit connection
      try {
        await connectRoom(livekitUrl, token);
      } catch (err: any) {
        console.error('[Telemedicine] LiveKit connection failed:', err?.message ?? err);
        if (!cancelled) {
          setConnState('failed');
          setErrorMsg(
            language === 'hi'
              ? 'LiveKit से कनेक्ट होने में विफल। कृपया पुनः प्रयास करें।'
              : 'Failed to connect to LiveKit. Please try reconnecting.',
          );
        }
      } finally {
        if (!cancelled) setInitLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      if (roomRef.current) {
        try { roomRef.current.disconnect(); } catch { /* noop */ }
        roomRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-scroll transcript
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [transcript]);

  // --------------------------------------------------------------------------
  // Media controls
  // --------------------------------------------------------------------------
  const toggleAudio = useCallback(async () => {
    if (roomRef.current) {
      try {
        await roomRef.current.localParticipant.setMicrophoneEnabled(!isAudioOn);
      } catch { /* noop */ }
    }
    setIsAudioOn((v) => !v);
  }, [isAudioOn]);

  const toggleVideo = useCallback(async () => {
    if (roomRef.current) {
      try {
        await roomRef.current.localParticipant.setCameraEnabled(!isVideoOn);
      } catch { /* noop */ }
    }
    setIsVideoOn((v) => !v);
  }, [isVideoOn]);

  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  }, []);

  // --------------------------------------------------------------------------
  // End call
  // --------------------------------------------------------------------------
  const handleEndCall = useCallback(() => {
    modal.confirm({
      title: language === 'hi' ? 'कॉल समाप्त करें?' : 'End Call?',
      content: language === 'hi'
        ? 'यह वीडियो परामर्श समाप्त करेगा।'
        : 'This will end the video consultation.',
      okText: language === 'hi' ? 'समाप्त करें' : 'End Call',
      cancelText: language === 'hi' ? 'रद्द करें' : 'Cancel',
      okType: 'danger' as const,
      onOk: async () => {
        // Disconnect LiveKit room
        if (roomRef.current) {
          try { roomRef.current.disconnect(); } catch { /* noop */ }
          roomRef.current = null;
        }

        // Tell the server the meeting is over
        try {
          await api.delete(endpoints.telemedicine.endMeeting(consultationId));
        } catch (err) {
          console.error('Failed to end meeting on server:', err);
        }

        setConnState('disconnected');
        message.success(language === 'hi' ? 'कॉल समाप्त' : 'Call ended');
        router.push(`/nurse/consultation/${consultationId}`);
      },
    });
  }, [consultationId, language, message, modal, router]);

  // --------------------------------------------------------------------------
  // Reconnect
  // --------------------------------------------------------------------------
  const handleReconnect = useCallback(async () => {
    setInitLoading(true);
    setErrorMsg(null);
    const meeting = await fetchMeetingToken();

    if (!meeting || !meeting.livekitUrl) {
      setConnState('failed');
      setErrorMsg(
        language === 'hi'
          ? 'मीटिंग टोकन प्राप्त करने में विफल। टेलीमेडिसिन सेवा अनुपलब्ध हो सकती है।'
          : 'Failed to fetch meeting token. The telemedicine service may be unavailable.',
      );
      setInitLoading(false);
      return;
    }

    try {
      await connectRoom(meeting.livekitUrl, meeting.token);
    } catch (err) {
      console.error('[Telemedicine] Reconnection failed:', err);
      setConnState('failed');
      setErrorMsg(
        language === 'hi'
          ? 'पुनः कनेक्ट करने में विफल। कृपया पुनः प्रयास करें।'
          : 'Reconnection failed. Please try again.',
      );
    } finally {
      setInitLoading(false);
    }
  }, [fetchMeetingToken, connectRoom, language]);

  // --------------------------------------------------------------------------
  // Derived labels
  // --------------------------------------------------------------------------
  const connLabel = (() => {
    const m: Record<ViewConnectionState, { en: string; hi: string }> = {
      disconnected: { en: 'Disconnected', hi: 'डिस्कनेक्ट' },
      connecting: { en: 'Connecting...', hi: 'कनेक्ट हो रहा है...' },
      connected: { en: 'Connected', hi: 'कनेक्टेड' },
      reconnecting: { en: 'Reconnecting...', hi: 'पुनः कनेक्ट...' },
      failed: { en: 'Failed', hi: 'कनेक्शन विफल' },
    };
    return language === 'hi' ? m[connState].hi : m[connState].en;
  })();

  const patientName = patient?.name ?? (language === 'hi' ? 'रोगी' : 'Patient');

  // --------------------------------------------------------------------------
  // Loading state
  // --------------------------------------------------------------------------
  if (initLoading && connState === 'disconnected') {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400 }}>
        <Spin size="large" tip={language === 'hi' ? 'कॉल से जुड़ रहा है...' : 'Joining call...'}>
          <div style={{ padding: 50 }} />
        </Spin>
      </div>
    );
  }

  // --------------------------------------------------------------------------
  // Render
  // --------------------------------------------------------------------------
  return (
    <div>
      {/* ---- Page Header ---- */}
      <PageHeader
        title={language === 'hi' ? 'वीडियो परामर्श' : 'Video Consultation'}
        subtitle={`${patientName} | ${language === 'hi' ? 'परामर्श' : 'Consultation'}: ${consultationId.slice(0, 8)}...`}
        extra={
          <Space>
            <Badge
              status={CONNECTION_BADGE[connState] as any}
              text={
                <Text style={{ fontSize: 13 }}>
                  {connState === 'connected' ? (
                    <WifiOutlined style={{ marginRight: 4 }} />
                  ) : connState === 'failed' ? (
                    <DisconnectOutlined style={{ marginRight: 4 }} />
                  ) : null}
                  {connLabel}
                </Text>
              }
            />
          </Space>
        }
      />

      {errorMsg && (
        <Alert
          type="warning"
          message={errorMsg}
          closable
          onClose={() => setErrorMsg(null)}
          style={{ marginBottom: 16 }}
        />
      )}

      <Row gutter={[16, 16]}>
        {/* ====== Left column: Video area ====== */}
        <Col xs={24} lg={15}>
          {/* Main video card */}
          <Card
            styles={{
              body: {
                padding: 0,
                position: 'relative',
                background: '#000',
                borderRadius: 8,
                overflow: 'hidden',
                minHeight: 280,
              },
            }}
            style={{ marginBottom: 16 }}
          >
            <div style={{ position: 'relative', minHeight: 280, background: '#000', aspectRatio: '16/9' }}>
                {/* Remote video (main) */}
                <video
                  ref={remoteVideoRef}
                  autoPlay
                  playsInline
                  style={{ width: '100%', height: '100%', objectFit: 'cover', minHeight: 280 }}
                />

                {/* Waiting overlay when no remote participant */}
                {!remoteJoined && (
                  <div
                    style={{
                      position: 'absolute',
                      inset: 0,
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      background: 'rgba(0,0,0,0.7)',
                      color: '#fff',
                    }}
                  >
                    <Spin size="large" />
                    <Text style={{ color: '#fff', marginTop: 16, fontSize: 14 }}>
                      {language === 'hi'
                        ? 'प्रतिभागी की प्रतीक्षा...'
                        : 'Waiting for participant...'}
                    </Text>
                  </div>
                )}

                {/* Local video PiP */}
                <div
                  style={{
                    position: 'absolute',
                    bottom: 12,
                    right: 12,
                    width: 'clamp(100px, 20%, 160px)',
                    aspectRatio: '4/3',
                    borderRadius: 8,
                    overflow: 'hidden',
                    border: '2px solid rgba(255,255,255,0.3)',
                    background: '#1a1a1a',
                  }}
                >
                  <video
                    ref={localVideoRef}
                    autoPlay
                    playsInline
                    muted
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'cover',
                      transform: 'scaleX(-1)',
                      display: isVideoOn ? 'block' : 'none',
                    }}
                  />
                  {!isVideoOn && (
                    <div
                      style={{
                        width: '100%',
                        height: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <UserOutlined style={{ fontSize: 28, color: '#666' }} />
                    </div>
                  )}
                </div>
            </div>
          </Card>

          {/* ---- Controls Bar ---- */}
          <Card style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <Space size="middle" wrap>
                {/* Mic */}
                <Tooltip
                  title={
                    isAudioOn
                      ? (language === 'hi' ? 'माइक बंद करें' : 'Mute Microphone')
                      : (language === 'hi' ? 'माइक चालू करें' : 'Unmute Microphone')
                  }
                >
                  <Button
                    shape="circle"
                    size="large"
                    type={isAudioOn ? 'default' : 'primary'}
                    danger={!isAudioOn}
                    icon={isAudioOn ? <AudioOutlined /> : <AudioMutedOutlined />}
                    onClick={toggleAudio}
                  />
                </Tooltip>

                {/* Camera */}
                <Tooltip
                  title={
                    isVideoOn
                      ? (language === 'hi' ? 'कैमरा बंद करें' : 'Disable Camera')
                      : (language === 'hi' ? 'कैमरा चालू करें' : 'Enable Camera')
                  }
                >
                  <Button
                    shape="circle"
                    size="large"
                    type={isVideoOn ? 'default' : 'primary'}
                    danger={!isVideoOn}
                    icon={isVideoOn ? <VideoCameraOutlined /> : <VideoCameraAddOutlined />}
                    onClick={toggleVideo}
                  />
                </Tooltip>

                {/* Patient Info */}
                <Tooltip title={language === 'hi' ? 'रोगी की जानकारी' : 'Patient Info'}>
                  <Button
                    shape="circle"
                    size="large"
                    icon={<InfoCircleOutlined />}
                    onClick={() => setDrawerOpen(true)}
                  />
                </Tooltip>

                {/* Fullscreen */}
                <Tooltip
                  title={
                    isFullscreen
                      ? (language === 'hi' ? 'फ़ुलस्क्रीन बंद' : 'Exit Fullscreen')
                      : (language === 'hi' ? 'फ़ुलस्क्रीन' : 'Fullscreen')
                  }
                >
                  <Button
                    shape="circle"
                    size="large"
                    icon={isFullscreen ? <CompressOutlined /> : <ExpandOutlined />}
                    onClick={toggleFullscreen}
                  />
                </Tooltip>

                {/* Reconnect (disconnected / failed) */}
                {(connState === 'disconnected' || connState === 'failed') && (
                  <Tooltip title={language === 'hi' ? 'पुनः कनेक्ट' : 'Reconnect'}>
                    <Button
                      shape="circle"
                      size="large"
                      type="primary"
                      icon={<ReloadOutlined />}
                      onClick={handleReconnect}
                    />
                  </Tooltip>
                )}

                {/* End Call */}
                <Tooltip title={language === 'hi' ? 'कॉल समाप्त करें' : 'End Call'}>
                  <Button
                    shape="circle"
                    size="large"
                    type="primary"
                    danger
                    icon={<PhoneOutlined style={{ transform: 'rotate(135deg)' }} />}
                    onClick={handleEndCall}
                  />
                </Tooltip>
              </Space>
            </div>
          </Card>
        </Col>

        {/* ====== Right column: Transcription + Patient summary ====== */}
        <Col xs={24} lg={9}>
          {/* Live Transcription */}
          <Card
            title={
              <Space>
                <AudioOutlined />
                {language === 'hi' ? 'लाइव प्रतिलेखन' : 'Live Transcription'}
              </Space>
            }
            style={{ marginBottom: 16 }}
            styles={{ body: { maxHeight: 380, overflowY: 'auto', padding: '12px 16px' } }}
          >
            {transcript.length === 0 ? (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description={
                  language === 'hi'
                    ? 'अभी कोई प्रतिलेख नहीं'
                    : 'No transcript yet'
                }
              />
            ) : (
              <div>
                {transcript.map((seg) => (
                  <div key={seg.id} style={{ marginBottom: 12 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
                      <Tag
                        color={seg.speaker.toLowerCase().includes('doctor') || seg.speaker.toLowerCase().includes('nurse') ? 'blue' : 'green'}
                        style={{ fontSize: 11 }}
                      >
                        {seg.speaker}
                      </Tag>
                      <Text type="secondary" style={{ fontSize: 10 }}>
                        {formatTime(seg.timestamp)}
                      </Text>
                    </div>
                    <Paragraph
                      style={{
                        margin: 0,
                        fontSize: 13,
                        opacity: seg.isFinal ? 1 : 0.7,
                        fontStyle: seg.isFinal ? 'normal' : 'italic',
                      }}
                    >
                      {seg.text}
                      {!seg.isFinal && <Text type="secondary"> ...</Text>}
                    </Paragraph>
                  </div>
                ))}
                <div ref={transcriptEndRef} />
              </div>
            )}
          </Card>

          {/* Patient Summary */}
          {patient && (
            <Card
              title={
                <Space>
                  <HeartOutlined />
                  {language === 'hi' ? 'रोगी विवरण' : 'Patient Summary'}
                </Space>
              }
              size="small"
              style={{ marginBottom: 16 }}
            >
              <Descriptions column={{ xs: 1, sm: 2 }} size="small">
                <Descriptions.Item label={language === 'hi' ? 'नाम' : 'Name'}>
                  {patient.name}
                </Descriptions.Item>
                <Descriptions.Item label={language === 'hi' ? 'उम्र' : 'Age'}>
                  {patient.age} {language === 'hi' ? 'वर्ष' : 'yrs'}, {patient.gender}
                </Descriptions.Item>
                <Descriptions.Item label="BP">
                  {vitals.systolic != null && vitals.diastolic != null
                    ? `${vitals.systolic}/${vitals.diastolic}`
                    : '-'}
                </Descriptions.Item>
                <Descriptions.Item label={language === 'hi' ? 'तापमान' : 'Temp'}>
                  {vitals.temperature != null
                    ? `${vitals.temperature}${vitals.temperatureUnit === 'F' ? '\u00b0F' : '\u00b0C'}`
                    : '-'}
                </Descriptions.Item>
                <Descriptions.Item label="HR">
                  {vitals.heartRate != null ? `${vitals.heartRate} bpm` : '-'}
                </Descriptions.Item>
                <Descriptions.Item label="SpO2">
                  {vitals.spO2 != null ? `${vitals.spO2}%` : '-'}
                </Descriptions.Item>
              </Descriptions>
              {patient.allergies && patient.allergies.length > 0 && (
                <>
                  <Divider style={{ margin: '8px 0' }} />
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    {language === 'hi' ? 'एलर्जी:' : 'Allergies:'}{' '}
                  </Text>
                  {patient.allergies.map((a) => (
                    <Tag key={a} color="red" style={{ fontSize: 11 }}>{a}</Tag>
                  ))}
                </>
              )}
            </Card>
          )}

          {/* Action buttons */}
          <Card>
            <Space direction="vertical" style={{ width: '100%' }} size="small">
              <Button block onClick={() => router.push(`/nurse/consultation/${consultationId}`)}>
                {language === 'hi' ? 'परामर्श पृष्ठ पर वापस जाएं' : 'Back to Consultation'}
              </Button>
              <Button
                block
                type="primary"
                danger
                icon={<PhoneOutlined style={{ transform: 'rotate(135deg)' }} />}
                onClick={handleEndCall}
              >
                {language === 'hi' ? 'कॉल समाप्त करें' : 'End Call'}
              </Button>
            </Space>
          </Card>
        </Col>
      </Row>

      {/* ---- Patient Info Drawer ---- */}
      <Drawer
        title={
          <Space>
            <MedicineBoxOutlined />
            {language === 'hi' ? 'रोगी की जानकारी' : 'Patient Information'}
          </Space>
        }
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        width={typeof window !== 'undefined' && window.innerWidth < 768 ? '100%' : 400}
      >
        {patient ? (
          <>
            <Descriptions column={1} size="small" bordered>
              <Descriptions.Item label={language === 'hi' ? 'नाम' : 'Name'}>
                {patient.name}
              </Descriptions.Item>
              <Descriptions.Item label={language === 'hi' ? 'उम्र' : 'Age'}>
                {patient.age} {language === 'hi' ? 'वर्ष' : 'yrs'}
              </Descriptions.Item>
              <Descriptions.Item label={language === 'hi' ? 'लिंग' : 'Gender'}>
                {patient.gender}
              </Descriptions.Item>
              {patient.phone && (
                <Descriptions.Item label={language === 'hi' ? 'फ़ोन' : 'Phone'}>
                  {patient.phone}
                </Descriptions.Item>
              )}
              {patient.abdmId && (
                <Descriptions.Item label="ABDM ID">
                  {patient.abdmId}
                </Descriptions.Item>
              )}
              {patient.bloodGroup && (
                <Descriptions.Item label={language === 'hi' ? 'रक्त समूह' : 'Blood Group'}>
                  <Tag color="red">{patient.bloodGroup}</Tag>
                </Descriptions.Item>
              )}
            </Descriptions>

            <Divider>{language === 'hi' ? 'वाइटल्स' : 'Vitals'}</Divider>
            <Descriptions column={2} size="small">
              <Descriptions.Item label="BP">
                {vitals.systolic != null && vitals.diastolic != null
                  ? `${vitals.systolic}/${vitals.diastolic} mmHg`
                  : '-'}
              </Descriptions.Item>
              <Descriptions.Item label={language === 'hi' ? 'तापमान' : 'Temp'}>
                {vitals.temperature != null
                  ? `${vitals.temperature}${vitals.temperatureUnit === 'F' ? '\u00b0F' : '\u00b0C'}`
                  : '-'}
              </Descriptions.Item>
              <Descriptions.Item label="HR">
                {vitals.heartRate != null ? `${vitals.heartRate} bpm` : '-'}
              </Descriptions.Item>
              <Descriptions.Item label="SpO2">
                {vitals.spO2 != null ? `${vitals.spO2}%` : '-'}
              </Descriptions.Item>
              <Descriptions.Item label="RR">
                {vitals.respiratoryRate != null ? `${vitals.respiratoryRate}/min` : '-'}
              </Descriptions.Item>
              <Descriptions.Item label={language === 'hi' ? 'दर्द' : 'Pain'}>
                {vitals.painScore != null ? `${vitals.painScore}/10` : '-'}
              </Descriptions.Item>
            </Descriptions>

            {patient.allergies && patient.allergies.length > 0 && (
              <>
                <Divider>{language === 'hi' ? 'एलर्जी' : 'Allergies'}</Divider>
                <Space wrap>
                  {patient.allergies.map((a) => (
                    <Tag key={a} color="red">{a}</Tag>
                  ))}
                </Space>
              </>
            )}

            {patient.chronicConditions && patient.chronicConditions.length > 0 && (
              <>
                <Divider>{language === 'hi' ? 'पुरानी स्थितियां' : 'Chronic Conditions'}</Divider>
                <Space wrap>
                  {patient.chronicConditions.map((c) => (
                    <Tag key={c} color="orange">{c}</Tag>
                  ))}
                </Space>
              </>
            )}
          </>
        ) : (
          <Empty
            description={
              language === 'hi'
                ? 'रोगी की जानकारी उपलब्ध नहीं'
                : 'Patient information not available'
            }
          />
        )}
      </Drawer>
    </div>
  );
}

import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  Upload, 
  File as FileIcon, 
  Download, 
  Eye, 
  Pause, 
  Play, 
  XCircle, 
  ShieldCheck, 
  Send, 
  Users, 
  MessageSquare, 
  FolderDown, 
  Smartphone, 
  Laptop, 
  Tablet, 
  AlertTriangle, 
  Loader2, 
  Lock, 
  Share2, 
  Copy, 
  Check, 
  Clock,
  LogOut,
  Power,
  UserCheck,
  Search,
  Trash2,
  History,
  Image as ImageIcon,
  Film,
  Music,
  FileText,
  FileArchive,
  ArrowUpDown,
  CheckCircle2,
  UserPlus,
  UserMinus,
  RefreshCw
} from 'lucide-react';
import { 
  RoomMetadata, 
  ParticipantInfo, 
  ChatMessage, 
  StoredFile,
  RoomActivityLog,
  formatBytes, 
  formatSpeed, 
  formatEta, 
  MOBILE_WARN_FILE_SIZE, 
  getFileExtension,
  getPreviewCategory 
} from '@phoenix-drop/shared';
import { Navbar } from './Navbar.js';
import { FilePreviewModal, PreviewableFile } from './FilePreviewModal.js';
import { HostSettingsModal } from './HostSettingsModal.js';
import { api } from '../services/api.js';
import { socketService } from '../services/socket.js';
import { webrtcManager } from '../services/webrtcManager.js';
import { transferEngine, FileTransferSession, computeSha256 } from '../services/transferEngine.js';

export const RoomView: React.FC = () => {
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();

  // Room state
  const [room, setRoom] = useState<RoomMetadata | null>(null);
  const [participants, setParticipants] = useState<ParticipantInfo[]>([]);
  const [selfId, setSelfId] = useState<string>('');
  const [participantToken, setParticipantToken] = useState<string>('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [isHost, setIsHost] = useState(false);
  const [hostToken, setHostToken] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'files' | 'chat' | 'peers' | 'activity'>('files');
  const [unreadChat, setUnreadChat] = useState(0);

  // Persistent File History & Activities
  const [roomFiles, setRoomFiles] = useState<StoredFile[]>([]);
  const [activities, setActivities] = useState<RoomActivityLog[]>([]);
  const [fileSearch, setFileSearch] = useState('');
  const [fileCategory, setFileCategory] = useState<string>('all');
  const [fileSort, setFileSort] = useState<'newest' | 'oldest'>('newest');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgressText, setUploadProgressText] = useState<string>('');
  const [previewFile, setPreviewFile] = useState<PreviewableFile | null>(null);
  const [fileToDelete, setFileToDelete] = useState<StoredFile | null>(null);

  // Dialog states
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [showHostLeaveDialog, setShowHostLeaveDialog] = useState(false);
  const [showCloseRoomConfirm, setShowCloseRoomConfirm] = useState(false);
  const [selectedNewHostId, setSelectedNewHostId] = useState<string>('');

  // Transfer state
  const [sessions, setSessions] = useState<FileTransferSession[]>([]);
  const [previewSession, setPreviewSession] = useState<FileTransferSession | null>(null);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [mobileWarning, setMobileWarning] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(true);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatScrollRef = useRef<HTMLDivElement>(null);

  // Initialize room & WebRTC
  useEffect(() => {
    if (!roomId) return;

    const storedHostToken = sessionStorage.getItem(`phoenix_host_${roomId}`);
    const storedPartToken = sessionStorage.getItem(`phoenix_token_${roomId}`) || '';
    const displayName = sessionStorage.getItem(`phoenix_name_${roomId}`) || 'Guest';

    if (storedHostToken) {
      setHostToken(storedHostToken);
      setIsHost(true);
    }
    if (storedPartToken) {
      setParticipantToken(storedPartToken);
    }

    const deviceType = window.innerWidth < 768 ? 'mobile' : window.innerWidth < 1024 ? 'tablet' : 'desktop';

    // Connect to room via Socket.IO
    socketService.joinRoom({
      roomId,
      displayName,
      deviceType
    }).then(async (res) => {
      if (res.error) {
        alert(`Failed to enter room: ${res.error}`);
        navigate('/');
        return;
      }

      if (res.room && res.self) {
        setRoom(res.room);
        setParticipants(res.room.participants || []);
        setIsHost(res.self.isHost);
        setSelfId(res.self.id);

        const currentToken = res.participantToken || storedPartToken;
        if (res.participantToken) {
          setParticipantToken(res.participantToken);
          sessionStorage.setItem(`phoenix_token_${roomId}`, res.participantToken);
        }

        // Initialize historical files from join response
        if (res.existingFiles && res.existingFiles.length > 0) {
          setRoomFiles(res.existingFiles);
        }

        // Initialize activity log
        if (res.activities && res.activities.length > 0) {
          setActivities(res.activities);
        }

        // Fetch fresh authorized files list from backend
        try {
          const filesData = await api.getFiles(roomId, currentToken);
          if (filesData?.files) {
            setRoomFiles(filesData.files);
          }
        } catch (e) {
          console.warn('[Room] Could not refresh file list from API:', e);
        }

        // Fetch fresh activity timeline
        try {
          const acts = await api.getActivities(roomId, currentToken);
          if (acts && acts.length > 0) {
            setActivities(acts);
          }
        } catch (e) {
          // Ignored
        }

        // Initialize WebRTC Manager
        webrtcManager.initialize(res.self.id, res.iceServers);
      }
      setConnecting(false);
    }).catch((err) => {
      console.error('[Room] Connection failed:', err);
      alert('Could not establish connection to room.');
      navigate('/');
    });

    // Listen to transfer engine updates
    const unsubscribeTransfer = transferEngine.subscribe((updatedSession) => {
      setSessions(transferEngine.getAllSessions());
    });

    // Listen to peer connection state changes
    const unsubscribeWebRTC = webrtcManager.onPeerStateChange((peerId, state) => {
      setParticipants((prev) =>
        prev.map((p) => (p.id === peerId ? { ...p, connectionState: state } : p))
      );
    });

    // Socket listeners for room updates, files, activities & chat
    const socket = socketService.getSocket();
    if (socket) {
      socket.on('signal:peer_joined', (data: { peer: ParticipantInfo }) => {
        setParticipants((prev) => {
          if (prev.some((p) => p.id === data.peer.id)) return prev;
          return [...prev, data.peer];
        });
      });

      socket.on('signal:peer_left', (data: { peerId: string }) => {
        setParticipants((prev) => prev.filter((p) => p.id !== data.peerId));
      });

      socket.on('chat:message', (msg: ChatMessage) => {
        setMessages((prev) => [...prev, msg]);
        if (activeTab !== 'chat') {
          setUnreadChat((c) => c + 1);
        }
      });

      socket.on('room:updated', (data: { settings: any; name?: string }) => {
        setRoom((prev) => (prev ? { ...prev, name: data.name || prev.name, settings: data.settings } : prev));
      });

      socket.on('room:host_transferred', (data: { newHostId: string }) => {
        setParticipants((prev) =>
          prev.map((p) => ({ ...p, isHost: p.id === data.newHostId }))
        );
        if (selfId && data.newHostId === selfId) {
          setIsHost(true);
        }
      });

      socket.on('file:created', (newFile: StoredFile) => {
        setRoomFiles((prev) => [newFile, ...prev.filter((f) => f.fileId !== newFile.fileId)]);
      });

      socket.on('file:deleted', (data: { fileId: string }) => {
        setRoomFiles((prev) => prev.filter((f) => f.fileId !== data.fileId));
      });

      socket.on('activity:new', (activity: RoomActivityLog) => {
        setActivities((prev) => [activity, ...prev.filter((a) => a.id !== activity.id)]);
      });

      socket.on('room:closed', (data: { message?: string }) => {
        alert(data.message || 'The room has been permanently closed by the host.');
        sessionStorage.removeItem(`phoenix_host_${roomId}`);
        sessionStorage.removeItem(`phoenix_token_${roomId}`);
        sessionStorage.removeItem(`phoenix_name_${roomId}`);
        navigate('/');
      });

      socket.on('room:kicked', (data: { reason: string }) => {
        alert(data.reason || 'You have been disconnected by the host.');
        navigate('/');
      });
    }

    return () => {
      unsubscribeTransfer();
      unsubscribeWebRTC();
      webrtcManager.closeAll();
      socketService.disconnect();
    };
  }, [roomId, navigate]);

  // Leave & Close Room Handlers
  const handleLeaveClick = () => {
    const otherParticipants = participants.filter((p) => p.id !== selfId);
    if (isHost && otherParticipants.length > 0) {
      setSelectedNewHostId(otherParticipants[0].id);
      setShowHostLeaveDialog(true);
    } else {
      setShowLeaveConfirm(true);
    }
  };

  const handleConfirmLeave = async () => {
    try {
      await socketService.leaveRoom();
      if (roomId) {
        sessionStorage.removeItem(`phoenix_host_${roomId}`);
        sessionStorage.removeItem(`phoenix_token_${roomId}`);
        sessionStorage.removeItem(`phoenix_name_${roomId}`);
      }
      navigate('/');
    } catch (e) {
      navigate('/');
    }
  };

  const handleHostLeaveWithTransfer = async () => {
    if (!selectedNewHostId || !roomId || !hostToken) return;
    try {
      await api.executeHostAction(roomId, hostToken, 'transfer_host', selectedNewHostId);
      await socketService.leaveRoom();
      sessionStorage.removeItem(`phoenix_host_${roomId}`);
      sessionStorage.removeItem(`phoenix_token_${roomId}`);
      sessionStorage.removeItem(`phoenix_name_${roomId}`);
      navigate('/');
    } catch (err: any) {
      alert(err.message || 'Failed to transfer ownership before leaving.');
    }
  };

  const handleConfirmCloseRoom = async () => {
    if (!roomId || !hostToken) return;
    try {
      await api.executeHostAction(roomId, hostToken, 'close_room');
      await socketService.closeRoom(hostToken);
      sessionStorage.removeItem(`phoenix_host_${roomId}`);
      sessionStorage.removeItem(`phoenix_token_${roomId}`);
      sessionStorage.removeItem(`phoenix_name_${roomId}`);
      navigate('/');
    } catch (err: any) {
      alert(err.message || 'Failed to close room.');
    }
  };

  // Auto-scroll chat
  useEffect(() => {
    if (activeTab === 'chat' && chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [messages, activeTab]);

  // Handle file uploading (Persistent Storage + WebRTC broadcast)
  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0 || !roomId) return;
    setUploadError(null);
    setMobileWarning(null);

    const isMobile = window.innerWidth < 768;
    const token = participantToken || hostToken || '';

    for (let i = 0; i < files.length; i++) {
      const file = files[i];

      // Check room settings
      if (room && !room.settings.uploadsEnabled) {
        setUploadError('File uploads are currently disabled in this room.');
        return;
      }

      if (room && file.size > room.settings.maxFileSize) {
        setUploadError(`File "${file.name}" exceeds maximum allowed size of ${formatBytes(room.settings.maxFileSize)}.`);
        return;
      }

      if (room && room.settings.allowedExtensions.length > 0) {
        const ext = getFileExtension(file.name);
        if (!room.settings.allowedExtensions.includes(ext)) {
          setUploadError(`File extension .${ext} is not permitted in this room.`);
          return;
        }
      }

      // Mobile warning for large transfers
      if (isMobile && file.size > MOBILE_WARN_FILE_SIZE) {
        setMobileWarning(
          `Notice: "${file.name}" is ${formatBytes(file.size)}. On mobile browsers, keep your screen unlocked and browser active to prevent transfer suspension.`
        );
      }

      setIsUploading(true);
      setUploadProgressText(`Uploading "${file.name}"...`);

      try {
        const sha256 = await computeSha256(file);
        
        // 1. Upload to persistent backend storage
        const uploaded = await api.uploadFile(roomId, token, file, sha256);
        setRoomFiles((prev) => [uploaded, ...prev.filter((f) => f.fileId !== uploaded.fileId)]);

        // 2. Also stream to any active peers over WebRTC DataChannel if connected
        try {
          await webrtcManager.broadcastFile(file);
        } catch (webrtcErr) {
          // P2P peer streaming optional when storage upload completes
          console.log('[Room] P2P broadcast note:', webrtcErr);
        }
      } catch (err: any) {
        setUploadError(err.message || `Failed to upload "${file.name}".`);
      } finally {
        setIsUploading(false);
        setUploadProgressText('');
      }
    }
  };

  const handleDeleteFile = async (file: StoredFile) => {
    if (!roomId) return;
    const token = participantToken || hostToken || '';
    try {
      await api.deleteFile(roomId, token, file.fileId);
      setRoomFiles((prev) => prev.filter((f) => f.fileId !== file.fileId));
      setFileToDelete(null);
    } catch (err: any) {
      alert(err.message || 'Failed to delete file');
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;

    const content = chatInput.trim();
    setChatInput('');

    const res = await socketService.sendChatMessage(content);
    if (res.error) {
      alert(res.error);
    }
  };

  const renderFileIcon = (fileType: string, fileName: string) => {
    const category = getPreviewCategory(fileType, fileName);
    switch (category) {
      case 'image':
        return <ImageIcon className="w-4 h-4 text-emerald-400" />;
      case 'video':
        return <Film className="w-4 h-4 text-purple-400" />;
      case 'audio':
        return <Music className="w-4 h-4 text-pink-400" />;
      case 'text':
      case 'pdf':
        return <FileText className="w-4 h-4 text-blue-400" />;
      case 'archive':
        return <FileArchive className="w-4 h-4 text-amber-400" />;
      default:
        return <FileIcon className="w-4 h-4 text-orange-400" />;
    }
  };

  const renderDeviceIcon = (deviceType: string) => {
    switch (deviceType) {
      case 'mobile':
        return <Smartphone className="w-3.5 h-3.5 text-zinc-400" />;
      case 'tablet':
        return <Tablet className="w-3.5 h-3.5 text-zinc-400" />;
      default:
        return <Laptop className="w-3.5 h-3.5 text-zinc-400" />;
    }
  };

  const renderActivityIcon = (type: string) => {
    switch (type) {
      case 'room_created':
        return <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />;
      case 'participant_joined':
        return <UserPlus className="w-3.5 h-3.5 text-blue-400" />;
      case 'participant_left':
        return <UserMinus className="w-3.5 h-3.5 text-zinc-400" />;
      case 'host_transferred':
        return <UserCheck className="w-3.5 h-3.5 text-amber-400" />;
      case 'file_uploaded':
        return <Upload className="w-3.5 h-3.5 text-orange-400" />;
      case 'file_deleted':
        return <Trash2 className="w-3.5 h-3.5 text-red-400" />;
      case 'room_closed':
        return <Power className="w-3.5 h-3.5 text-red-400" />;
      case 'room_locked':
        return <Lock className="w-3.5 h-3.5 text-amber-400" />;
      default:
        return <Clock className="w-3.5 h-3.5 text-zinc-400" />;
    }
  };

  if (connecting) {
    return (
      <div className="min-h-screen bg-[#0c0d10] flex flex-col items-center justify-center text-zinc-300">
        <Loader2 className="w-8 h-8 text-orange-500 animate-spin mb-4" />
        <p className="text-sm font-medium">Entering Room & Negotiating P2P Channels...</p>
      </div>
    );
  }

  // Filter and Sort Persistent Files
  const filteredFiles = roomFiles.filter((f) => {
    if (fileSearch) {
      const q = fileSearch.toLowerCase();
      if (!f.fileName.toLowerCase().includes(q)) return false;
    }
    if (fileCategory !== 'all') {
      const cat = getPreviewCategory(f.fileType, f.fileName);
      if (cat !== fileCategory) return false;
    }
    return true;
  });

  filteredFiles.sort((a, b) => {
    const timeA = new Date(a.createdAt).getTime();
    const timeB = new Date(b.createdAt).getTime();
    return fileSort === 'oldest' ? timeA - timeB : timeB - timeA;
  });

  const activeTransfers = sessions.filter((s) => s.state !== 'completed');

  return (
    <div className="min-h-screen bg-[#0c0d10] text-zinc-100 flex flex-col selection:bg-orange-500/30">
      <Navbar
        roomCode={room?.code}
        isHost={isHost}
        isLocked={room?.settings.isLocked}
        participantCount={participants.length}
        maxParticipants={room?.settings.maxParticipants}
        onOpenSettings={() => setShowSettingsModal(true)}
        onLeaveRoom={handleLeaveClick}
        onCloseRoom={() => setShowCloseRoomConfirm(true)}
      />

      {/* Main Grid View */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Participant Presence */}
        <div className={`lg:col-span-3 space-y-4 ${activeTab === 'peers' ? 'block' : 'hidden lg:block'}`}>
          <div className="bg-[#12141a] border border-zinc-800 rounded-2xl p-4 shadow-sm">
            <div className="flex items-center justify-between mb-3 pb-3 border-b border-zinc-800/80">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-orange-400" />
                <h3 className="text-xs font-bold text-zinc-200 uppercase tracking-wider">Peers Connected</h3>
              </div>
              <span className="text-xs font-mono text-zinc-400 bg-zinc-900 px-2 py-0.5 rounded-full border border-zinc-800">
                {participants.length}/{room?.settings.maxParticipants}
              </span>
            </div>

            <div className="space-y-2 max-h-[70vh] overflow-y-auto">
              {participants.length === 0 ? (
                <div className="text-center py-6 text-xs text-zinc-500">
                  Waiting for peers to join... Share your room link!
                </div>
              ) : (
                participants.map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center justify-between p-2.5 bg-zinc-900/60 border border-zinc-850 rounded-xl text-xs"
                  >
                    <div className="flex items-center gap-2.5 overflow-hidden">
                      <div className="relative">
                        <div className="w-7 h-7 rounded-lg bg-zinc-800 flex items-center justify-center font-bold text-zinc-300">
                          {p.displayName.slice(0, 1).toUpperCase()}
                        </div>
                        <span
                          className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-[#12141a] ${
                            p.connectionState === 'connected' ? 'bg-emerald-500' : 'bg-amber-500'
                          }`}
                        />
                      </div>
                      <div className="overflow-hidden">
                        <div className="flex items-center gap-1.5">
                          <span className="font-semibold text-zinc-200 truncate">{p.displayName}</span>
                          {p.isHost && (
                            <span className="text-[9px] text-orange-400 bg-orange-500/10 px-1.5 py-0.2 rounded border border-orange-500/20 font-bold">
                              Host
                            </span>
                          )}
                          {p.id === selfId && (
                            <span className="text-[9px] text-zinc-400 bg-zinc-800 px-1.5 py-0.2 rounded">
                              You
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1 text-[10px] text-zinc-500">
                          {renderDeviceIcon(p.deviceType)}
                          <span className="capitalize">{p.deviceType}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Center Column: Files & Transfers OR Activity Timeline */}
        <div className={`lg:col-span-6 space-y-4 ${activeTab === 'files' || activeTab === 'activity' ? 'block' : 'hidden lg:block'}`}>
          {/* Room Header Card with Leave & Close Options */}
          <div className="bg-[#12141a] border border-zinc-800 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3 shadow-sm">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-white tracking-tight">{room?.name}</h2>
                {isHost && (
                  <span className="text-[10px] text-orange-400 bg-orange-500/10 border border-orange-500/20 px-2 py-0.5 rounded-full font-semibold">
                    Host
                  </span>
                )}
              </div>
              <p className="text-xs text-zinc-400 font-mono mt-0.5">
                Room Code: <span className="text-orange-400 font-bold">{room?.code}</span> • {participants.length} peer{participants.length === 1 ? '' : 's'} • {roomFiles.length} file{roomFiles.length === 1 ? '' : 's'}
              </p>
            </div>

            <div className="flex items-center gap-2">
              {isHost && (
                <button
                  onClick={() => setShowCloseRoomConfirm(true)}
                  className="px-3 py-1.5 rounded-xl bg-red-950/40 hover:bg-red-900/60 border border-red-800/80 text-red-300 hover:text-white text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
                  title="Close room permanently for all peers"
                >
                  <Power className="w-3.5 h-3.5 text-red-400" />
                  <span>Close Room</span>
                </button>
              )}
              <button
                onClick={handleLeaveClick}
                className="px-3 py-1.5 rounded-xl bg-zinc-900 hover:bg-zinc-850 border border-zinc-800 hover:border-red-900/60 text-zinc-300 hover:text-red-300 text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
                title="Leave this room"
              >
                <LogOut className="w-3.5 h-3.5 text-zinc-400 hover:text-red-400" />
                <span>Leave Room</span>
              </button>
            </div>
          </div>

          {/* Tab Selector between Files and Activity */}
          <div className="flex items-center gap-2 bg-[#12141a] p-1 rounded-xl border border-zinc-800">
            <button
              onClick={() => setActiveTab('files')}
              className={`flex-1 py-1.5 text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 transition cursor-pointer ${
                activeTab === 'files'
                  ? 'bg-orange-600 text-white shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <FolderDown className="w-3.5 h-3.5" />
              <span>Shared Files ({roomFiles.length})</span>
            </button>
            <button
              onClick={() => setActiveTab('activity')}
              className={`flex-1 py-1.5 text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 transition cursor-pointer ${
                activeTab === 'activity'
                  ? 'bg-orange-600 text-white shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <History className="w-3.5 h-3.5" />
              <span>Activity Timeline ({activities.length})</span>
            </button>
          </div>

          {activeTab === 'activity' ? (
            /* Persistent Activity Timeline */
            <div className="bg-[#12141a] border border-zinc-800 rounded-2xl p-4 shadow-sm space-y-3">
              <div className="flex items-center justify-between pb-3 border-b border-zinc-800/80">
                <h3 className="text-xs font-bold text-zinc-200 uppercase tracking-wider flex items-center gap-2">
                  <History className="w-4 h-4 text-orange-400" />
                  <span>Room Activity Timeline</span>
                </h3>
                <span className="text-xs text-zinc-400 font-mono">{activities.length} event{activities.length === 1 ? '' : 's'}</span>
              </div>

              {activities.length === 0 ? (
                <div className="text-center py-12 text-xs text-zinc-500">
                  No activities recorded yet in this room.
                </div>
              ) : (
                <div className="space-y-2.5 max-h-[60vh] overflow-y-auto pr-1">
                  {activities.map((act) => (
                    <div
                      key={act.id}
                      className="p-3 bg-zinc-900/60 border border-zinc-850 rounded-xl flex items-start gap-3 text-xs"
                    >
                      <div className="p-2 rounded-lg bg-zinc-800 text-zinc-300 mt-0.5 shrink-0">
                        {renderActivityIcon(act.type)}
                      </div>
                      <div className="flex-1 overflow-hidden">
                        <p className="text-zinc-200 leading-snug break-words">{act.description}</p>
                        <p className="text-[10px] text-zinc-400 font-mono mt-1">
                          {new Date(act.timestamp).toLocaleString()}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <>
              {/* Mobile suspension alert if any */}
              {mobileWarning && (
                <div className="p-3.5 bg-amber-950/60 border border-amber-800/80 rounded-xl text-amber-200 text-xs flex items-start gap-2.5">
                  <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400 mt-0.5" />
                  <span>{mobileWarning}</span>
                </div>
              )}

              {/* Upload error banner if any */}
              {uploadError && (
                <div className="p-3.5 bg-red-950/60 border border-red-800/80 rounded-xl text-red-200 text-xs flex items-start gap-2.5">
                  <XCircle className="w-4 h-4 shrink-0 text-red-400 mt-0.5" />
                  <span>{uploadError}</span>
                </div>
              )}

              {/* Uploading progress indicator */}
              {isUploading && (
                <div className="p-3.5 bg-orange-950/40 border border-orange-800/60 rounded-xl text-orange-200 text-xs flex items-center gap-3 animate-pulse">
                  <Loader2 className="w-4 h-4 shrink-0 text-orange-400 animate-spin" />
                  <span>{uploadProgressText || 'Uploading to shared persistent room...'}</span>
                </div>
              )}

              {/* Dropzone */}
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsDragging(false);
                  handleFiles(e.dataTransfer.files);
                }}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-2xl p-6 sm:p-10 text-center transition cursor-pointer flex flex-col items-center justify-center ${
                  isDragging
                    ? 'border-orange-500 bg-orange-500/5'
                    : 'border-zinc-800 hover:border-zinc-700 bg-[#12141a]/60 hover:bg-[#12141a]'
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  className="hidden"
                  onChange={(e) => handleFiles(e.target.files)}
                />
                <div className="w-12 h-12 rounded-2xl bg-orange-500/10 border border-orange-500/20 text-orange-400 flex items-center justify-center mb-3">
                  <Upload className="w-6 h-6" />
                </div>
                <h3 className="text-sm font-bold text-white mb-1">
                  Drag & Drop files here, or <span className="text-orange-400">browse</span>
                </h3>
                <p className="text-xs text-zinc-400 max-w-sm">
                  Persistent room storage with Cloudflare R2 & P2P WebRTC. Configured limit up to 10 GB.
                </p>
              </div>

              {/* Active Transfers Queue */}
              {activeTransfers.length > 0 && (
                <div className="space-y-3">
                  <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Active P2P Transfers</h3>
                  <div className="space-y-2.5">
                    {activeTransfers.map((session) => {
                      const percentage = Math.round((session.bytesTransferred / session.totalBytes) * 100) || 0;
                      return (
                        <div
                          key={session.fileId}
                          className="p-4 bg-[#14161d] border border-zinc-800 rounded-2xl shadow-sm space-y-3"
                        >
                          <div className="flex items-center justify-between text-xs">
                            <div className="flex items-center gap-2 overflow-hidden">
                              <FileIcon className="w-4 h-4 text-orange-400 shrink-0" />
                              <span className="font-semibold text-zinc-200 truncate">{session.metadata.fileName}</span>
                              <span className="text-zinc-500 font-mono text-[11px]">({formatBytes(session.totalBytes)})</span>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              {session.state === 'transferring' && (
                                <button
                                  onClick={() => transferEngine.pauseTransfer(session.fileId)}
                                  title="Pause"
                                  className="p-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300"
                                >
                                  <Pause className="w-3.5 h-3.5" />
                                </button>
                              )}
                              {session.state === 'paused' && (
                                <button
                                  onClick={() => transferEngine.resumeTransfer(session.fileId)}
                                  title="Resume"
                                  className="p-1 rounded bg-orange-600 hover:bg-orange-500 text-white"
                                >
                                  <Play className="w-3.5 h-3.5" />
                                </button>
                              )}
                              <button
                                onClick={() => transferEngine.cancelTransfer(session.fileId)}
                                title="Cancel"
                                className="p-1 rounded bg-zinc-800 hover:bg-zinc-700 text-red-400"
                              >
                                <XCircle className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>

                          <div className="w-full bg-zinc-900 rounded-full h-2 overflow-hidden border border-zinc-800">
                            <div
                              className="bg-gradient-to-r from-orange-500 to-amber-400 h-full rounded-full transition-all duration-300"
                              style={{ width: `${percentage}%` }}
                            />
                          </div>

                          <div className="flex items-center justify-between text-[11px] font-mono text-zinc-400">
                            <span>
                              {percentage}% • {session.state === 'verifying' ? 'Verifying SHA-256...' : session.state}
                            </span>
                            <span>
                              {formatSpeed(session.speedBps)} • ETA: {formatEta(session.etaSeconds)}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Persistent Shared Files Gallery */}
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider">
                    Room Files ({filteredFiles.length} of {roomFiles.length})
                  </h3>

                  {/* Sort Selector */}
                  <div className="flex items-center gap-1 text-xs">
                    <ArrowUpDown className="w-3.5 h-3.5 text-zinc-400" />
                    <select
                      value={fileSort}
                      onChange={(e) => setFileSort(e.target.value as 'newest' | 'oldest')}
                      className="bg-[#14161d] border border-zinc-800 rounded-lg px-2 py-1 text-zinc-300 text-xs focus:outline-none"
                    >
                      <option value="newest">Newest First</option>
                      <option value="oldest">Oldest First</option>
                    </select>
                  </div>
                </div>

                {/* Search & Category Filter Bar */}
                <div className="bg-[#12141a] p-3 rounded-2xl border border-zinc-800 space-y-2.5">
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={fileSearch}
                      onChange={(e) => setFileSearch(e.target.value)}
                      placeholder="Search files by name..."
                      className="w-full pl-8 pr-3 py-1.5 bg-zinc-900 border border-zinc-800 rounded-xl text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-orange-500"
                    />
                  </div>

                  <div className="flex flex-wrap gap-1.5 text-xs">
                    {['all', 'image', 'video', 'audio', 'document', 'archive', 'other'].map((cat) => (
                      <button
                        key={cat}
                        onClick={() => setFileCategory(cat)}
                        className={`px-2.5 py-1 rounded-lg capitalize text-[11px] font-medium transition cursor-pointer ${
                          fileCategory === cat
                            ? 'bg-orange-600 text-white'
                            : 'bg-zinc-900 text-zinc-400 hover:text-zinc-200'
                        }`}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>
                </div>

                {/* File List */}
                {filteredFiles.length === 0 ? (
                  <div className="p-8 bg-[#12141a]/40 border border-zinc-800/60 rounded-2xl text-center text-xs text-zinc-500">
                    {roomFiles.length === 0
                      ? 'No files uploaded to this room yet. Drag & drop or browse above!'
                      : 'No files match your search filter.'}
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {filteredFiles.map((file) => {
                      const downloadUrl = api.getDownloadUrl(roomId || '', participantToken || hostToken || '', file.fileId);
                      const canDelete = isHost || (selfId && file.senderId === selfId);

                      return (
                        <div
                          key={file.fileId}
                          className="p-3.5 bg-[#14161d] border border-zinc-800 hover:border-zinc-700/80 rounded-xl flex flex-col justify-between gap-2.5 transition"
                        >
                          <div className="flex items-start gap-2.5 overflow-hidden">
                            <div className="p-2 rounded-lg bg-zinc-900 border border-zinc-800 shrink-0 mt-0.5">
                              {renderFileIcon(file.fileType, file.fileName)}
                            </div>
                            <div className="overflow-hidden flex-1">
                              <h4 className="text-xs font-semibold text-zinc-200 truncate" title={file.fileName}>
                                {file.fileName}
                              </h4>
                              <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-zinc-400 font-mono mt-0.5">
                                <span>{formatBytes(file.fileSize)}</span>
                                <span>•</span>
                                <span>{file.senderName}</span>
                              </div>
                              <p className="text-[10px] text-zinc-400 mt-0.5">
                                {new Date(file.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                              </p>
                            </div>
                          </div>

                          <div className="pt-2 border-t border-zinc-850 flex items-center justify-between">
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() =>
                                  setPreviewFile({
                                    fileName: file.fileName,
                                    fileType: file.fileType,
                                    fileSize: file.fileSize,
                                    downloadUrl,
                                    senderName: file.senderName,
                                    createdAt: file.createdAt,
                                    sha256: file.sha256
                                  })
                                }
                                title="Preview File"
                                className="p-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white transition cursor-pointer"
                              >
                                <Eye className="w-3.5 h-3.5" />
                              </button>
                              <a
                                href={downloadUrl}
                                download={file.fileName}
                                title="Download File"
                                className="p-1.5 rounded-lg bg-orange-600 hover:bg-orange-500 text-white transition cursor-pointer flex items-center gap-1 text-[11px] font-semibold px-2"
                              >
                                <Download className="w-3.5 h-3.5" />
                                <span>Download</span>
                              </a>
                            </div>

                            {canDelete && (
                              <button
                                onClick={() => setFileToDelete(file)}
                                title="Delete file"
                                className="p-1.5 rounded-lg bg-zinc-850 hover:bg-red-950/80 text-zinc-400 hover:text-red-400 transition cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Right Column: Real-Time Chat */}
        <div className={`lg:col-span-3 ${activeTab === 'chat' ? 'block' : 'hidden lg:block'}`}>
          <div className="bg-[#12141a] border border-zinc-800 rounded-2xl flex flex-col h-[70vh] shadow-sm">
            {/* Chat Header */}
            <div className="p-3.5 border-b border-zinc-800 flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-orange-400" />
              <h3 className="text-xs font-bold text-zinc-200 uppercase tracking-wider">Room Chat</h3>
            </div>

            {/* Messages Feed */}
            <div ref={chatScrollRef} className="flex-1 p-3.5 overflow-y-auto space-y-2.5 text-xs">
              {messages.length === 0 ? (
                <div className="text-center py-10 text-zinc-500 text-[11px]">
                  No messages yet. Say hello to peers!
                </div>
              ) : (
                messages.map((m) => (
                  <div key={m.id} className="space-y-0.5">
                    {m.isSystem ? (
                      <div className="text-center py-1 text-[10px] text-zinc-400 font-medium italic">
                        {m.content}
                      </div>
                    ) : (
                      <div className="bg-zinc-900/80 border border-zinc-850 p-2.5 rounded-xl space-y-1">
                        <div className="flex items-center justify-between text-[10px]">
                          <span className="font-semibold text-zinc-300">
                            {m.senderName} {m.isHost && <span className="text-orange-400 ml-1">(Host)</span>}
                          </span>
                          <span className="text-zinc-400 font-mono">
                            {new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        <p className="text-zinc-200 break-words leading-relaxed">{m.content}</p>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>

            {/* Chat Input */}
            <form onSubmit={handleSendMessage} className="p-2.5 border-t border-zinc-800 flex items-center gap-2">
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder="Type a message..."
                maxLength={1000}
                className="flex-1 bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-orange-500 transition"
              />
              <button
                type="submit"
                disabled={!chatInput.trim()}
                className="p-2 rounded-xl bg-orange-600 hover:bg-orange-500 disabled:opacity-50 text-white transition cursor-pointer"
              >
                <Send className="w-3.5 h-3.5" />
              </button>
            </form>
          </div>
        </div>
      </main>

      {/* Mobile Bottom Navigation Bar */}
      <nav className="lg:hidden sticky bottom-0 z-40 w-full bg-[#12141a]/95 border-t border-zinc-800 backdrop-blur-md flex items-center justify-around py-2">
        <button
          onClick={() => setActiveTab('files')}
          className={`flex flex-col items-center gap-1 text-xs py-1 px-3 cursor-pointer ${
            activeTab === 'files' ? 'text-orange-400 font-bold' : 'text-zinc-400'
          }`}
        >
          <FolderDown className="w-4 h-4" />
          <span>Files</span>
        </button>

        <button
          onClick={() => setActiveTab('activity')}
          className={`flex flex-col items-center gap-1 text-xs py-1 px-3 cursor-pointer ${
            activeTab === 'activity' ? 'text-orange-400 font-bold' : 'text-zinc-400'
          }`}
        >
          <History className="w-4 h-4" />
          <span>Activity</span>
        </button>

        <button
          onClick={() => {
            setActiveTab('chat');
            setUnreadChat(0);
          }}
          className={`flex flex-col items-center gap-1 text-xs py-1 px-3 relative cursor-pointer ${
            activeTab === 'chat' ? 'text-orange-400 font-bold' : 'text-zinc-400'
          }`}
        >
          <MessageSquare className="w-4 h-4" />
          <span>Chat</span>
          {unreadChat > 0 && (
            <span className="absolute top-0 right-2 w-3.5 h-3.5 bg-orange-500 text-white text-[8px] rounded-full flex items-center justify-center font-bold">
              {unreadChat}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('peers')}
          className={`flex flex-col items-center gap-1 text-xs py-1 px-3 cursor-pointer ${
            activeTab === 'peers' ? 'text-orange-400 font-bold' : 'text-zinc-400'
          }`}
        >
          <Users className="w-4 h-4" />
          <span>Peers ({participants.length})</span>
        </button>
      </nav>

      {/* Modals */}
      {previewSession && (
        <FilePreviewModal
          session={previewSession}
          onClose={() => setPreviewSession(null)}
        />
      )}

      {previewFile && (
        <FilePreviewModal
          file={previewFile}
          onClose={() => setPreviewFile(null)}
        />
      )}

      {/* Delete File Confirmation Modal */}
      {fileToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-sm bg-[#12141a] border border-zinc-800 rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-red-500/10 text-red-400">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Delete File?</h3>
                <p className="text-xs text-zinc-400">Remove from shared room history</p>
              </div>
            </div>

            <p className="text-xs text-zinc-300 leading-relaxed">
              Are you sure you want to remove <strong className="text-white">"{fileToDelete.fileName}"</strong>? All peers will no longer be able to download this file.
            </p>

            <div className="pt-2 flex items-center justify-end gap-2.5">
              <button
                onClick={() => setFileToDelete(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-zinc-400 hover:text-white hover:bg-zinc-800 transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDeleteFile(fileToDelete)}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-red-600 hover:bg-red-500 text-white shadow-lg shadow-red-600/30 transition cursor-pointer"
              >
                Delete File
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Participant Leave Confirmation Modal */}
      {showLeaveConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-sm bg-[#12141a] border border-zinc-800 rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-400">
                <LogOut className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Leave Room?</h3>
                <p className="text-xs text-zinc-400">You will disconnect from this file session.</p>
              </div>
            </div>

            <p className="text-xs text-zinc-300 leading-relaxed">
              Your uploaded files will remain available in the room history for other participants. You can rejoin at any time using the room code.
            </p>

            <div className="pt-2 flex items-center justify-end gap-2.5">
              <button
                onClick={() => setShowLeaveConfirm(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-zinc-400 hover:text-white hover:bg-zinc-800 transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmLeave}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-red-600 hover:bg-red-500 text-white shadow-lg shadow-red-600/30 transition cursor-pointer"
              >
                Leave Room
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Host Leave Dialog with Ownership Transfer */}
      {showHostLeaveDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-md bg-[#12141a] border border-zinc-800 rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-orange-500/10 text-orange-400">
                <UserCheck className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Host Departure</h3>
                <p className="text-xs text-zinc-400">Transfer room ownership before leaving</p>
              </div>
            </div>

            <p className="text-xs text-zinc-300 leading-relaxed">
              You are the room host. The room and all uploaded files will remain active. Please select a participant to become the new host below:
            </p>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-zinc-400">Select New Host:</label>
              <select
                value={selectedNewHostId}
                onChange={(e) => setSelectedNewHostId(e.target.value)}
                className="w-full px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-xl text-xs text-white focus:outline-none focus:border-orange-500"
              >
                {participants
                  .filter((p) => p.id !== selfId)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.displayName} ({p.deviceType})
                    </option>
                  ))}
              </select>
            </div>

            <div className="pt-3 flex flex-col sm:flex-row items-center justify-end gap-2">
              <button
                onClick={() => setShowHostLeaveDialog(false)}
                className="w-full sm:w-auto px-3.5 py-2 rounded-xl text-xs font-semibold text-zinc-400 hover:text-white hover:bg-zinc-800 transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmCloseRoom}
                className="w-full sm:w-auto px-3.5 py-2 rounded-xl text-xs font-semibold bg-zinc-850 hover:bg-red-950/80 text-zinc-300 hover:text-red-300 border border-zinc-750 hover:border-red-800 transition cursor-pointer"
              >
                Close Room
              </button>
              <button
                onClick={handleHostLeaveWithTransfer}
                className="w-full sm:w-auto px-4 py-2 rounded-xl text-xs font-semibold bg-orange-600 hover:bg-orange-500 text-white shadow-lg shadow-orange-600/30 transition cursor-pointer"
              >
                Transfer & Leave
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Host Close Room Permanent Confirmation Modal */}
      {showCloseRoomConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-sm bg-[#12141a] border border-red-900/60 rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-red-500/10 text-red-400">
                <Power className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Permanently Close Room?</h3>
                <p className="text-xs text-red-300">This action cannot be undone</p>
              </div>
            </div>

            <p className="text-xs text-zinc-300 leading-relaxed">
              Closing this room will permanently disconnect all participants, stop new uploads and downloads, and prevent anyone from rejoining.
            </p>

            <div className="pt-2 flex items-center justify-end gap-2.5">
              <button
                onClick={() => setShowCloseRoomConfirm(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-zinc-400 hover:text-white hover:bg-zinc-800 transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmCloseRoom}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-red-600 hover:bg-red-500 text-white shadow-lg shadow-red-600/30 transition cursor-pointer"
              >
                Close Room Now
              </button>
            </div>
          </div>
        </div>
      )}

      {showSettingsModal && room && hostToken && (
        <HostSettingsModal
          room={room}
          hostToken={hostToken}
          participants={participants}
          onClose={() => setShowSettingsModal(false)}
          onRoomClosed={() => {
            alert('Room has been closed.');
            navigate('/');
          }}
          onRoomDeleted={() => {
            alert('Room has been deleted.');
            navigate('/');
          }}
          onSettingsUpdated={(newSettings, newName) => {
            setRoom((prev) => (prev ? { ...prev, name: newName || prev.name, settings: newSettings } : prev));
          }}
        />
      )}
    </div>
  );
};

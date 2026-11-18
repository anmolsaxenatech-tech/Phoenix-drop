import React, { useState } from 'react';
import { 
  X, 
  Settings, 
  Lock, 
  Unlock, 
  Trash2, 
  Users, 
  ShieldAlert, 
  Check, 
  Loader2 
} from 'lucide-react';
import { RoomMetadata, RoomSettings, ParticipantInfo } from '@phoenix-drop/shared';
import { api } from '../services/api.js';
import { socketService } from '../services/socket.js';

interface HostSettingsModalProps {
  room: RoomMetadata;
  hostToken: string;
  participants: ParticipantInfo[];
  onClose: () => void;
  onRoomDeleted: () => void;
  onSettingsUpdated: (newSettings: RoomSettings, newName?: string) => void;
}

export const HostSettingsModal: React.FC<HostSettingsModalProps> = ({
  room,
  hostToken,
  participants,
  onClose,
  onRoomDeleted,
  onSettingsUpdated
}) => {
  const [name, setName] = useState(room.name);
  const [maxParticipants, setMaxParticipants] = useState(room.settings.maxParticipants);
  const [uploadsEnabled, setUploadsEnabled] = useState(room.settings.uploadsEnabled);
  const [downloadsEnabled, setDownloadsEnabled] = useState(room.settings.downloadsEnabled);
  const [chatEnabled, setChatEnabled] = useState(room.settings.chatEnabled);
  const [isLocked, setIsLocked] = useState(room.settings.isLocked);
  const [loading, setLoading] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedSuccess, setSavedSuccess] = useState(false);

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSavedSuccess(false);

    try {
      const updated: Partial<RoomSettings> = {
        maxParticipants,
        uploadsEnabled,
        downloadsEnabled,
        chatEnabled,
        isLocked
      };

      await api.updateSettings(room.id, hostToken, updated, name);
      socketService.updateSettings(updated, hostToken, name);

      onSettingsUpdated({ ...room.settings, ...updated }, name);
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 2000);
    } catch (err: any) {
      setError(err.message || 'Failed to update settings');
    } finally {
      setLoading(false);
    }
  };

  const handleKick = async (targetId: string) => {
    try {
      await api.executeHostAction(room.id, hostToken, 'kick_participant', targetId);
      socketService.kickParticipant(targetId, hostToken);
    } catch (err: any) {
      setError(err.message || 'Failed to remove participant');
    }
  };

  const handleTransferHost = async (targetId: string) => {
    if (!confirm('Transfer room host permissions to this participant? You will forfeit host control.')) return;
    try {
      await api.executeHostAction(room.id, hostToken, 'transfer_host', targetId);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to transfer host');
    }
  };

  const handleDeleteRoom = async () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    setLoading(true);
    try {
      await api.executeHostAction(room.id, hostToken, 'delete_room');
      onRoomDeleted();
    } catch (err: any) {
      setError(err.message || 'Failed to delete room');
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-lg bg-[#12141a] border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-zinc-800 flex items-center justify-between bg-zinc-900/50">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-orange-500/10 text-orange-400">
              <Settings className="w-5 h-5" />
            </div>
            <h2 className="text-base font-bold text-white">Host Controls & Room Settings</h2>
          </div>
          <button 
            onClick={onClose}
            className="text-zinc-400 hover:text-white p-1 rounded-lg hover:bg-zinc-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-6 text-sm">
          {error && (
            <div className="p-3 bg-red-950/60 border border-red-800/80 rounded-xl text-red-300 text-xs flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {savedSuccess && (
            <div className="p-3 bg-emerald-950/60 border border-emerald-800/80 rounded-xl text-emerald-300 text-xs flex items-center gap-2">
              <Check className="w-4 h-4 shrink-0" />
              <span>Room settings successfully updated!</span>
            </div>
          )}

          <form onSubmit={handleSaveSettings} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-zinc-300 mb-1.5">Room Name</label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-zinc-900 border border-zinc-800 rounded-xl text-white focus:outline-none focus:border-orange-500 transition"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-zinc-300 mb-1.5 flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5 text-zinc-400" />
                  <span>Max Capacity</span>
                </label>
                <select
                  value={maxParticipants}
                  onChange={(e) => setMaxParticipants(Number(e.target.value))}
                  className="w-full px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-xl text-white focus:outline-none focus:border-orange-500 transition"
                >
                  <option value={2}>2 Peers</option>
                  <option value={5}>5 Peers</option>
                  <option value={10}>10 Peers</option>
                  <option value={16}>16 Peers</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-300 mb-1.5 flex items-center gap-1.5">
                  {isLocked ? <Lock className="w-3.5 h-3.5 text-amber-400" /> : <Unlock className="w-3.5 h-3.5 text-emerald-400" />}
                  <span>Room Lock</span>
                </label>
                <select
                  value={isLocked ? 'locked' : 'open'}
                  onChange={(e) => setIsLocked(e.target.value === 'locked')}
                  className="w-full px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-xl text-white focus:outline-none focus:border-orange-500 transition"
                >
                  <option value="open">Open for New Peers</option>
                  <option value="locked">Locked (Block New Joins)</option>
                </select>
              </div>
            </div>

            <div className="space-y-2 pt-2 border-t border-zinc-800/80">
              <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Features</span>
              
              <label className="flex items-center justify-between p-2.5 bg-zinc-900/60 border border-zinc-800/60 rounded-xl cursor-pointer hover:bg-zinc-900 transition">
                <span className="text-xs text-zinc-200">Allow File Uploads</span>
                <input
                  type="checkbox"
                  checked={uploadsEnabled}
                  onChange={(e) => setUploadsEnabled(e.target.checked)}
                  className="accent-orange-500 w-4 h-4 cursor-pointer"
                />
              </label>

              <label className="flex items-center justify-between p-2.5 bg-zinc-900/60 border border-zinc-800/60 rounded-xl cursor-pointer hover:bg-zinc-900 transition">
                <span className="text-xs text-zinc-200">Allow File Downloads</span>
                <input
                  type="checkbox"
                  checked={downloadsEnabled}
                  onChange={(e) => setDownloadsEnabled(e.target.checked)}
                  className="accent-orange-500 w-4 h-4 cursor-pointer"
                />
              </label>

              <label className="flex items-center justify-between p-2.5 bg-zinc-900/60 border border-zinc-800/60 rounded-xl cursor-pointer hover:bg-zinc-900 transition">
                <span className="text-xs text-zinc-200">Enable Room Chat</span>
                <input
                  type="checkbox"
                  checked={chatEnabled}
                  onChange={(e) => setChatEnabled(e.target.checked)}
                  className="accent-orange-500 w-4 h-4 cursor-pointer"
                />
              </label>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 bg-orange-600 hover:bg-orange-500 disabled:opacity-50 text-white font-semibold rounded-xl shadow-lg shadow-orange-600/30 flex items-center justify-center gap-2 transition cursor-pointer"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <span>Save Settings</span>}
            </button>
          </form>

          {/* Connected Participants Management */}
          <div className="pt-4 border-t border-zinc-800">
            <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">
              Participant Management ({participants.length})
            </h3>
            <div className="space-y-2 max-h-40 overflow-y-auto">
              {participants.map((p) => (
                <div key={p.id} className="flex items-center justify-between p-2.5 bg-zinc-900/40 border border-zinc-850 rounded-xl text-xs">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-500" />
                    <span className="font-medium text-zinc-200">{p.displayName}</span>
                    {p.isHost && <span className="text-[10px] text-orange-400 bg-orange-500/10 px-1.5 py-0.5 rounded">Host</span>}
                  </div>

                  {!p.isHost && (
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => handleTransferHost(p.id)}
                        className="px-2 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded text-[11px] transition cursor-pointer"
                      >
                        Make Host
                      </button>
                      <button
                        onClick={() => handleKick(p.id)}
                        className="px-2 py-1 bg-red-950/60 hover:bg-red-900/80 text-red-400 rounded text-[11px] transition cursor-pointer"
                      >
                        Kick
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Danger Zone */}
          <div className="pt-4 border-t border-red-950/60">
            <h3 className="text-xs font-semibold text-red-400 uppercase tracking-wider mb-2">Danger Zone</h3>
            <p className="text-xs text-zinc-500 mb-3">
              Permanently close this room and disconnect all participants.
            </p>
            <button
              type="button"
              onClick={handleDeleteRoom}
              disabled={loading}
              className="w-full py-2.5 bg-red-950/80 hover:bg-red-900 border border-red-800 text-red-200 font-semibold rounded-xl flex items-center justify-center gap-2 transition cursor-pointer"
            >
              <Trash2 className="w-4 h-4" />
              <span>{confirmDelete ? 'Confirm: Delete Room Now' : 'Delete Room'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

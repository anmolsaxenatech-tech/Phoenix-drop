import React from 'react';
import { Flame, Shield, Lock, Unlock, Copy, Share2, Check, Users } from 'lucide-react';

interface NavbarProps {
  roomCode?: string;
  isHost?: boolean;
  isLocked?: boolean;
  participantCount?: number;
  maxParticipants?: number;
  onOpenSettings?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  roomCode,
  isHost,
  isLocked,
  participantCount = 0,
  maxParticipants = 10,
  onOpenSettings
}) => {
  const [copied, setCopied] = React.useState(false);

  const handleCopyLink = () => {
    const url = window.location.href;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Phoenix Drop Room',
          text: `Join my Phoenix Drop room to exchange files directly! Room Code: ${roomCode}`,
          url: window.location.href
        });
      } catch (e) {
        // user cancelled share
      }
    } else {
      handleCopyLink();
    }
  };

  return (
    <header className="sticky top-0 z-40 w-full border-b border-zinc-800/80 bg-[#0e0f12]/95 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
        {/* Brand */}
        <a href="/" className="flex items-center gap-2.5 group">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-orange-500 to-amber-600 p-0.5 shadow-lg shadow-orange-500/20 group-hover:shadow-orange-500/40 transition">
            <div className="w-full h-full bg-[#121316] rounded-[10px] flex items-center justify-center">
              <Flame className="w-5 h-5 text-orange-400 fill-orange-400 group-hover:scale-110 transition-transform" />
            </div>
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-bold text-base tracking-tight text-zinc-100">PHOENIX</span>
              <span className="font-extrabold text-base tracking-tight text-orange-500">DROP</span>
            </div>
            <p className="hidden sm:block text-[10px] text-zinc-400 font-medium tracking-wide">
              One Room. Unlimited Possibilities.
            </p>
          </div>
        </a>

        {/* Room Header Actions */}
        {roomCode ? (
          <div className="flex items-center gap-2 sm:gap-3">
            {/* Room Code Badge */}
            <div className="flex items-center gap-1.5 bg-zinc-900 border border-zinc-800 px-2.5 py-1.5 rounded-lg text-xs font-mono font-semibold text-zinc-200">
              <span className="text-zinc-500 uppercase text-[10px]">Code:</span>
              <span className="tracking-widest text-orange-400">{roomCode}</span>
            </div>

            {/* Participants counter */}
            <div className="hidden sm:flex items-center gap-1.5 bg-zinc-900 border border-zinc-800 px-2.5 py-1.5 rounded-lg text-xs font-medium text-zinc-300">
              <Users className="w-3.5 h-3.5 text-zinc-400" />
              <span>{participantCount}/{maxParticipants}</span>
            </div>

            {/* Locked Indicator */}
            {isLocked && (
              <div className="flex items-center gap-1 bg-amber-950/60 border border-amber-800/80 px-2 py-1.5 rounded-lg text-xs font-medium text-amber-300">
                <Lock className="w-3.5 h-3.5" />
                <span className="hidden md:inline">Locked</span>
              </div>
            )}

            {/* Copy / Share Button */}
            <button
              onClick={handleCopyLink}
              title="Copy room invite link"
              className="p-2 text-zinc-300 hover:text-white bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded-lg transition flex items-center gap-1.5 text-xs font-medium"
            >
              {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
              <span className="hidden sm:inline">{copied ? 'Copied' : 'Invite'}</span>
            </button>

            {/* Web Share API on mobile */}
            <button
              onClick={handleShare}
              title="Share via device"
              className="sm:hidden p-2 text-zinc-300 hover:text-white bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded-lg transition"
            >
              <Share2 className="w-4 h-4" />
            </button>

            {/* Host Settings Trigger */}
            {isHost && onOpenSettings && (
              <button
                onClick={onOpenSettings}
                className="px-2.5 py-1.5 bg-orange-600/20 hover:bg-orange-600/30 text-orange-400 border border-orange-500/40 rounded-lg text-xs font-semibold transition"
              >
                Host
              </button>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 text-xs text-zinc-400 bg-zinc-900/60 border border-zinc-800 px-3 py-1.5 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              P2P WebRTC Direct
            </span>
          </div>
        )}
      </div>
    </header>
  );
};

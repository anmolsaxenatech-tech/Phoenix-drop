import React, { useState } from 'react';
import { 
  Flame, 
  ArrowRight, 
  PlusCircle, 
  LogIn, 
  ShieldCheck, 
  Zap, 
  Smartphone, 
  Cpu, 
  Lock, 
  HardDrive, 
  ChevronDown, 
  CheckCircle2, 
  HelpCircle, 
  Layers, 
  Share2 
} from 'lucide-react';
import { CreateRoomModal } from './CreateRoomModal.js';
import { JoinRoomModal } from './JoinRoomModal.js';

export const LandingPage: React.FC = () => {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  const toggleFaq = (index: number) => {
    setOpenFaq(openFaq === index ? null : index);
  };

  const faqs = [
    {
      q: 'Are any files stored on Phoenix Drop servers?',
      a: 'Absolutely not. Phoenix Drop uses WebRTC DataChannels for direct, peer-to-peer transmission between devices. The lightweight signaling server only brokers the initial connection handshake. Zero file bytes ever touch or reside on our servers.'
    },
    {
      q: 'Is there a file size limit?',
      a: 'The platform supports configured file sizes up to 10 GB using chunk-based streaming (64–256 KB frames) and adaptive backpressure. However, actual file capability depends on your device RAM, browser storage mechanisms, and network stability.'
    },
    {
      q: 'Is Phoenix Drop truly free?',
      a: 'Yes. Our infrastructure budget is strictly ₹0. We rely exclusively on free-tier public STUN servers and zero-cloud-storage architecture. No credit cards, subscriptions, or automatic billing dependencies exist.'
    },
    {
      q: 'Does it work across different devices and operating systems?',
      a: 'Yes! Phoenix Drop is a responsive Progressive Web App (PWA) compatible with Windows, macOS, Linux, Android Chrome, and iOS Safari. All you need is a modern WebRTC-compatible browser.'
    },
    {
      q: 'What happens if a device switches networks or goes to sleep?',
      a: 'Mobile operating systems (especially iOS) may pause background WebRTC transfers when the screen is locked or the browser tab is suspended. Keep the tab open and active during file transfers for maximum reliability.'
    }
  ];

  return (
    <div className="min-h-screen bg-[#0c0d10] text-zinc-100 selection:bg-orange-500/30 selection:text-orange-200">
      {/* Hero Section */}
      <section className="relative pt-24 pb-20 md:pt-32 md:pb-28 overflow-hidden">
        {/* Subtle background glow */}
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[300px] bg-gradient-to-tr from-orange-600/10 via-amber-600/5 to-transparent blur-3xl pointer-events-none rounded-full" />

        <div className="max-w-5xl mx-auto px-4 sm:px-6 text-center relative z-10">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-zinc-900 border border-zinc-800 text-xs font-medium text-orange-400 mb-8 shadow-sm">
            <span className="w-2 h-2 rounded-full bg-orange-500 animate-pulse" />
            Zero Server Storage • Direct P2P Transfer • Free-First
          </div>

          {/* Heading */}
          <h1 className="text-4xl sm:text-6xl md:text-7xl font-extrabold tracking-tight text-white mb-6 leading-[1.1]">
            Your Files. Your People. <br />
            <span className="bg-gradient-to-r from-orange-400 via-amber-300 to-orange-500 bg-clip-text text-transparent">
              One Room.
            </span>
          </h1>

          {/* Description */}
          <p className="max-w-2xl mx-auto text-lg sm:text-xl text-zinc-400 font-normal mb-10 leading-relaxed">
            Create a room, invite anyone, and share anything. Directly between devices. Simple, fast and private.
          </p>

          {/* Primary Action Buttons */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 max-w-md mx-auto">
            <button
              onClick={() => setShowCreateModal(true)}
              className="w-full sm:w-auto px-7 py-3.5 rounded-xl bg-orange-600 hover:bg-orange-500 text-white font-semibold text-base shadow-lg shadow-orange-600/25 hover:shadow-orange-600/40 transition flex items-center justify-center gap-2.5 group cursor-pointer"
            >
              <PlusCircle className="w-5 h-5 group-hover:rotate-90 transition-transform" />
              <span>Create Room</span>
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </button>

            <button
              onClick={() => setShowJoinModal(true)}
              className="w-full sm:w-auto px-7 py-3.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-700/80 text-zinc-200 hover:text-white font-semibold text-base transition flex items-center justify-center gap-2.5 cursor-pointer"
            >
              <LogIn className="w-5 h-5 text-zinc-400" />
              <span>Join Room</span>
            </button>
          </div>

          {/* Architecture Trust Highlights */}
          <div className="mt-14 pt-10 border-t border-zinc-850 grid grid-cols-2 sm:grid-cols-4 gap-6 text-left max-w-4xl mx-auto">
            <div className="flex flex-col gap-1">
              <span className="text-2xl font-bold text-zinc-100 font-mono">0 Bytes</span>
              <span className="text-xs text-zinc-400">Server File Storage</span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-2xl font-bold text-orange-400 font-mono">10 GB</span>
              <span className="text-xs text-zinc-400">Chunk Transfer Engine</span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-2xl font-bold text-zinc-100 font-mono">SHA-256</span>
              <span className="text-xs text-zinc-400">Integrity Verification</span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-2xl font-bold text-emerald-400 font-mono">₹0</span>
              <span className="text-xs text-zinc-400">Zero-Cost Policy</span>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section className="py-20 bg-[#101115] border-y border-zinc-850">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <h2 className="text-xs uppercase tracking-widest text-orange-400 font-semibold mb-2">Simple Workflow</h2>
            <p className="text-3xl font-bold text-white tracking-tight">How Phoenix Drop Works</p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            <div className="bg-[#14151a] border border-zinc-800 p-6 rounded-2xl relative">
              <div className="w-10 h-10 rounded-xl bg-orange-500/10 border border-orange-500/20 text-orange-400 flex items-center justify-center font-bold text-lg mb-4">
                1
              </div>
              <h3 className="text-lg font-semibold text-zinc-100 mb-2">Create a Private Room</h3>
              <p className="text-sm text-zinc-400 leading-relaxed">
                Generate an ephemeral room in seconds with no registration required. Configure participant limits, expiration, and permissions.
              </p>
            </div>

            <div className="bg-[#14151a] border border-zinc-850 p-6 rounded-2xl relative">
              <div className="w-10 h-10 rounded-xl bg-orange-500/10 border border-orange-500/20 text-orange-400 flex items-center justify-center font-bold text-lg mb-4">
                2
              </div>
              <h3 className="text-lg font-semibold text-zinc-100 mb-2">Share Code or Link</h3>
              <p className="text-sm text-zinc-400 leading-relaxed">
                Send the 6-character room code or secure invitation URL to peers across Windows, Mac, Linux, Android, or iOS.
              </p>
            </div>

            <div className="bg-[#14151a] border border-zinc-800 p-6 rounded-2xl relative">
              <div className="w-10 h-10 rounded-xl bg-orange-500/10 border border-orange-500/20 text-orange-400 flex items-center justify-center font-bold text-lg mb-4">
                3
              </div>
              <h3 className="text-lg font-semibold text-zinc-100 mb-2">Direct P2P Transfer</h3>
              <p className="text-sm text-zinc-400 leading-relaxed">
                Drop your files. WebRTC DataChannels send bytes directly from device to device at maximum local or internet bandwidth.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Why Phoenix Drop Section */}
      <section className="py-20 bg-[#0c0d10]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <h2 className="text-xs uppercase tracking-widest text-orange-400 font-semibold mb-2">Engineered for Performance</h2>
            <p className="text-3xl font-bold text-white tracking-tight">Why Choose Phoenix Drop</p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div className="p-6 rounded-2xl bg-zinc-900/60 border border-zinc-800">
              <HardDrive className="w-6 h-6 text-orange-400 mb-3" />
              <h3 className="text-base font-semibold text-white mb-2">Zero Cloud Storage</h3>
              <p className="text-xs text-zinc-400 leading-relaxed">
                Your files never touch external buckets, third-party databases, or intermediate caching servers. Direct peer exchange only.
              </p>
            </div>

            <div className="p-6 rounded-2xl bg-zinc-900/60 border border-zinc-800">
              <Zap className="w-6 h-6 text-amber-400 mb-3" />
              <h3 className="text-base font-semibold text-white mb-2">Adaptive Backpressure</h3>
              <p className="text-xs text-zinc-400 leading-relaxed">
                Monitors RTCDataChannel buffered amount in real time, preventing browser memory crashes and optimizing high-throughput transfer.
              </p>
            </div>

            <div className="p-6 rounded-2xl bg-zinc-900/60 border border-zinc-800">
              <ShieldCheck className="w-6 h-6 text-emerald-400 mb-3" />
              <h3 className="text-base font-semibold text-white mb-2">SHA-256 Verification</h3>
              <p className="text-xs text-zinc-400 leading-relaxed">
                Every chunk stream is cryptographically validated using the Web Crypto API before the file is marked complete.
              </p>
            </div>

            <div className="p-6 rounded-2xl bg-zinc-900/60 border border-zinc-800">
              <Cpu className="w-6 h-6 text-orange-400 mb-3" />
              <h3 className="text-base font-semibold text-white mb-2">Controlled Fan-Out</h3>
              <p className="text-xs text-zinc-400 leading-relaxed">
                Send to up to 10 participants simultaneously with sender bandwidth throttling and concurrency management.
              </p>
            </div>

            <div className="p-6 rounded-2xl bg-zinc-900/60 border border-zinc-800">
              <Smartphone className="w-6 h-6 text-amber-400 mb-3" />
              <h3 className="text-base font-semibold text-white mb-2">PWA Mobile Integration</h3>
              <p className="text-xs text-zinc-400 leading-relaxed">
                Installable Progressive Web App with native file picker, Web Share API, and responsive mobile-first UI.
              </p>
            </div>

            <div className="p-6 rounded-2xl bg-zinc-900/60 border border-zinc-800">
              <Lock className="w-6 h-6 text-emerald-400 mb-3" />
              <h3 className="text-base font-semibold text-white mb-2">Host Access Controls</h3>
              <p className="text-xs text-zinc-400 leading-relaxed">
                Full host governance: lock rooms, kick participants, transfer ownership, toggle upload permissions, and set room expirations.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Security Section */}
      <section className="py-20 bg-[#101115] border-t border-zinc-850">
        <div className="max-w-4xl mx-auto px-4 sm:px-6">
          <div className="bg-zinc-900/80 border border-zinc-800 rounded-3xl p-8 sm:p-12 relative overflow-hidden">
            <div className="flex items-start gap-4 mb-6">
              <div className="p-3 bg-orange-500/10 border border-orange-500/20 rounded-2xl text-orange-400">
                <Lock className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-2xl font-bold text-white mb-1">Privacy & Security Principles</h3>
                <p className="text-sm text-zinc-400">Built with secure-by-default architecture</p>
              </div>
            </div>

            <div className="space-y-4 text-sm text-zinc-300">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                <span><strong>No File Retention:</strong> File content is never received, recorded, or written to server disks.</span>
              </div>
              <div className="flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                <span><strong>Cryptographic Tokens:</strong> Secure, high-entropy tokens protect host permissions and room access.</span>
              </div>
              <div className="flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                <span><strong>Sanitized Payloads:</strong> Filenames and chat messages are aggressively sanitized to prevent path traversal and XSS.</span>
              </div>
              <div className="flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                <span><strong>Transparent WebRTC Privacy:</strong> P2P connections disclose peer IP addresses to each other as part of direct ICE networking. No false claims of total anonymity.</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="py-20 bg-[#0c0d10]">
        <div className="max-w-3xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-14">
            <h2 className="text-xs uppercase tracking-widest text-orange-400 font-semibold mb-2">Answers to Common Questions</h2>
            <p className="text-3xl font-bold text-white tracking-tight">Frequently Asked Questions</p>
          </div>

          <div className="space-y-3">
            {faqs.map((faq, idx) => (
              <div 
                key={idx} 
                className="bg-zinc-900/50 border border-zinc-800 rounded-xl overflow-hidden transition"
              >
                <button
                  onClick={() => toggleFaq(idx)}
                  className="w-full px-5 py-4 text-left flex items-center justify-between gap-4 font-medium text-sm text-zinc-200 hover:text-white cursor-pointer"
                >
                  <span>{faq.q}</span>
                  <ChevronDown className={`w-4 h-4 text-zinc-400 transition-transform ${openFaq === idx ? 'rotate-180 text-orange-400' : ''}`} />
                </button>
                {openFaq === idx && (
                  <div className="px-5 pb-5 text-xs text-zinc-400 leading-relaxed border-t border-zinc-800/60 pt-3">
                    {faq.a}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 border-t border-zinc-850 bg-[#090a0d] text-zinc-400 text-xs">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-2">
            <Flame className="w-4 h-4 text-orange-500 fill-orange-500" />
            <span className="font-bold text-zinc-200">PHOENIX DROP</span>
            <span className="text-zinc-600">|</span>
            <span>One Room. Unlimited Possibilities.</span>
          </div>

          <div className="flex items-center gap-6 text-zinc-400">
            <span>Free-Tier Best Effort Infrastructure</span>
            <span>WebRTC Direct Channels</span>
          </div>
        </div>
      </footer>

      {/* Modals */}
      {showCreateModal && <CreateRoomModal onClose={() => setShowCreateModal(false)} />}
      {showJoinModal && <JoinRoomModal onClose={() => setShowJoinModal(false)} />}
    </div>
  );
};

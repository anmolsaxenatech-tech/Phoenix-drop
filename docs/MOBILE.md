# Mobile Device Compatibility & Limitations Report

## 1. Supported Mobile Platforms

Phoenix Drop is engineered as a responsive Progressive Web App (PWA) supporting:
- **Android**: Google Chrome, Brave, Firefox for Android, Samsung Internet.
- **iOS / iPadOS**: Safari (iOS 15.4+), Chrome for iOS.

## 2. Platform Optimizations

### Android Chrome
- **File Picker**: Native OS file picker integration via `<input type="file" multiple />`.
- **Large File Handling**: Supports chunk-by-chunk binary streaming with Web Crypto API acceleration.
- **Downloads**: Triggers browser-managed downloads using Blob object URLs.
- **Web Share**: Native Web Share API integration for one-tap room invitation sharing.

### iOS Safari
- **DataChannel Memory Limits**: Strict 64 KB chunk size prevents WebKit buffer allocations from crashing the tab.
- **DOM & SVG Safety**: Avoids innerHTML injection or dynamic script evaluation.
- **Blob Handling**: Safely creates download links and triggers iOS Safari file saving sheet.

## 3. Crucial Mobile Limitations (Transparent Disclosure)

1. **OS Background Suspension**:
   - Both Android and iOS aggressively throttle or suspend JavaScript execution and network sockets (including WebRTC DataChannels) when a tab is backgrounded or when the device screen locks.
   - **User Guidance**: Phoenix Drop displays a visible warning when files larger than 500 MB are queued on mobile, reminding users to keep the browser tab active and screen unlocked until completion.
   - **No Background Magic**: Service workers **cannot** maintain uninhibited WebRTC DataChannel connections in the background without native OS notification exceptions. Phoenix Drop does not make false promises regarding background WebRTC streaming.

2. **RAM & Storage Headroom**:
   - Transferring a 10 GB file on a budget mobile phone with 2 GB RAM is physically constrained by device memory. Chunk disposal and progressive writing are applied, but transfers remain subject to physical device storage limits.

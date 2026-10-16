/**
 * Jelly Web Inspector
 * A lightweight, read-only web inspector that can be embedded into any website with a single script tag.
 * https://jelly-web-inspector.vercel.app/index.js
 */

(function () {
    if (window.__JellyWebInspector__) return;
    window.__JellyWebInspector__ = true;

    // --- State & Captures ---
    const MAX_LOGS = 1000;
    const logs = [];
    const networkEntries = [];
    let hasSeenIntro = false;
    
    // Capture Console
    const originalConsole = {
        log: console.log, info: console.info, warn: console.warn, 
        error: console.error, debug: console.debug
    };

    function interceptConsole(type) {
        return function (...args) {
            originalConsole[type].apply(console, args);
            logs.push({ type, time: new Date(), args });
            if (logs.length > MAX_LOGS) logs.shift();
            if (uiState.isOpen && uiState.activeTab === 'console') renderConsoleTab();
        };
    }

    console.log = interceptConsole('log');
    console.info = interceptConsole('info');
    console.warn = interceptConsole('warn');
    console.error = interceptConsole('error');
    console.debug = interceptConsole('debug');

    window.addEventListener('error', (e) => {
        logs.push({ type: 'error', time: new Date(), args: [e.message, '\nFile:', e.filename, 'Line:', e.lineno] });
        if (uiState.isOpen && uiState.activeTab === 'console') renderConsoleTab();
    });

    window.addEventListener('unhandledrejection', (e) => {
        logs.push({ type: 'error', time: new Date(), args: ['Unhandled Promise Rejection:', e.reason] });
        if (uiState.isOpen && uiState.activeTab === 'console') renderConsoleTab();
    });

    // Capture WebSockets
    const NativeWebSocket = window.WebSocket;
    if (NativeWebSocket) {
        window.WebSocket = function(...args) {
            const ws = new NativeWebSocket(...args);
            const url = args[0];
            networkEntries.push({ 
                name: url, type: 'websocket', initiatorType: 'websocket', 
                duration: 0, transferSize: null, time: new Date().toLocaleTimeString() 
            });
            if (uiState.isOpen && uiState.activeTab === 'network') renderNetworkTab();
            
            // Optional: Log WebSocket messages to console
            ws.addEventListener('message', (e) => {
                logs.push({ type: 'info', time: new Date(), args: [`[WS] Message from ${url}:`, e.data] });
                if (uiState.isOpen && uiState.activeTab === 'console') renderConsoleTab();
            });
            return ws;
        };
        // Copy prototype to ensure instanceof works
        window.WebSocket.prototype = NativeWebSocket.prototype;
    }

    // Capture Network
    if ('performance' in window && performance.getEntriesByType) {
        performance.getEntriesByType('navigation').forEach(e => networkEntries.push(e));
        performance.getEntriesByType('resource').forEach(e => networkEntries.push(e));
        
        if ('PerformanceObserver' in window) {
            const observer = new PerformanceObserver((list) => {
                for (const entry of list.getEntries()) {
                    networkEntries.push(entry);
                }
                if (uiState.isOpen && uiState.activeTab === 'network') renderNetworkTab();
            });
            observer.observe({ entryTypes: ['resource', 'navigation'] });
        }
    }

    // --- UI State & Constants ---
    const uiState = {
        isOpen: false,
        isMinimized: false,
        isFullscreen: false,
        savedBounds: { left: '5vw', top: '5vh', width: '90vw', height: '90vh' },
        activeTab: 'elements',
        expandedNodes: new WeakSet(),
        selectedNode: null,
        consoleFilter: ''
    };

    // Icons
    const ICONS = {
        hammer: `<svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M15 12l-8.5 8.5c-.83.83-2.17.83-3 0 0 0 0 0 0 0a2.12 2.12 0 0 1 0-3L12 9"/><path d="M17.64 15L22 10.64"/><path d="M20.91 11.7l-1.25-1.25c-.6-.6-.93-1.4-.93-2.25v-.86L16.01 4.6a5.56 5.56 0 0 0-3.94-1.64H9l.92.82A6.18 6.18 0 0 1 12 8.4v1.56l2 2h2.47l2.26 1.91"/></svg>`,
        elements: `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"></polyline><polyline points="8 6 2 12 8 18"></polyline></svg>`,
        console: `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 17 10 11 4 5"></polyline><line x1="12" y1="19" x2="20" y2="19"></line></svg>`,
        sources: `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>`,
        network: `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg>`,
        storage: `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"></ellipse><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"></path><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"></path></svg>`,
        performance: `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>`,
        log_info: `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#0A84FF" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>`,
        log_warn: `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#FF9F0A" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>`,
        log_err: `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#FF453A" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>`,
        log_debug: `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>`,
        search: `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>`
    };

    // --- DOM Setup ---
    const host = document.createElement('div');
    host.id = 'jelly-inspector-host';
    host.style.position = 'fixed';
    host.style.zIndex = '2147483647';
    document.documentElement.appendChild(host);

    const shadow = host.attachShadow({ mode: 'open' });

    const styles = document.createElement('style');
    styles.textContent = `
        :host {
            --bg-base: #FFFFFF;
            --bg-panel: #F6F6F6;
            --bg-hover: #E8E8E8;
            --bg-active: #DFDFDF;
            --border: #D1D1D1;
            --text-main: #333333;
            --text-muted: #888888;
            --accent: #007AFF; 
            --accent-text: #FFFFFF;
            
            /* Highlighting */
            --hl-tag: #881280;
            --hl-attr: #994500;
            --hl-val: #1A1AA6;
            --hl-kw: #0000FF;
            --hl-str: #A31515;
            --hl-num: #098658;
            --hl-cmnt: #008000;
            
            --font-main: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            --font-mono: "SF Mono", Monaco, Menlo, Consolas, "Courier New", monospace;
            --shadow-float: 0 10px 40px rgba(0,0,0,0.15), 0 0 1px rgba(0,0,0,0.3);
        }
        
        @media (prefers-color-scheme: dark) {
            :host {
                --bg-base: #1E1E1E;
                --bg-panel: #2D2D2D;
                --bg-hover: #3A3A3A;
                --bg-active: #4A4A4A;
                --border: #4A4A4A;
                --text-main: #EFEFEF;
                --text-muted: #999999;
                --accent: #0A84FF;
                
                --hl-tag: #FF7AB2;
                --hl-attr: #D28E5D;
                --hl-val: #66C8FF;
                --hl-kw: #569CD6;
                --hl-str: #CE9178;
                --hl-num: #B5CEA8;
                --hl-cmnt: #6A9955;
                
                --shadow-float: 0 12px 50px rgba(0,0,0,0.5), 0 0 1px rgba(0,0,0,0.6);
            }
        }

        * { box-sizing: border-box; margin: 0; padding: 0; font-family: var(--font-main); }
        
        /* Floating Button */
        #launcher {
            position: fixed; bottom: 20px; right: 20px; width: 48px; height: 48px;
            background: var(--bg-base); 
            border: 1px solid var(--border); border-radius: 50%;
            display: flex; align-items: center; justify-content: center;
            color: var(--text-main); cursor: pointer;
            box-shadow: var(--shadow-float); transition: transform 0.2s cubic-bezier(0.25, 0.8, 0.25, 1);
            user-select: none; z-index: 100;
        }
        #launcher:hover { transform: scale(1.05); }
        #launcher:active { transform: scale(0.95); }

        /* Modal Overlay */
        #modal-overlay {
            position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
            background: rgba(0, 0, 0, 0.4); backdrop-filter: blur(8px);
            display: none; align-items: center; justify-content: center;
            opacity: 0; transition: opacity 0.3s ease; z-index: 101;
        }
        #modal-overlay.visible { display: flex; opacity: 1; }
        
        .modal-content {
            background: var(--bg-base); padding: 32px; border-radius: 16px;
            width: 320px; text-align: center; box-shadow: var(--shadow-float);
            transform: translateY(20px) scale(0.95); transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
        }
        #modal-overlay.visible .modal-content { transform: translateY(0) scale(1); }
        .modal-icon {
            display: inline-flex; align-items: center; justify-content: center;
            width: 64px; height: 64px; border-radius: 16px; background: var(--bg-panel);
            color: var(--text-main); margin-bottom: 20px; border: 1px solid var(--border);
        }
        .modal-content h2 { font-size: 20px; font-weight: 600; color: var(--text-main); margin-bottom: 10px; }
        .modal-content p { font-size: 14px; color: var(--text-muted); line-height: 1.5; margin-bottom: 24px; }
        
        .btn-primary {
            background: var(--accent); color: var(--accent-text); border: none;
            padding: 12px 20px; border-radius: 8px; font-size: 14px; font-weight: 600;
            cursor: pointer; width: 100%; transition: opacity 0.2s;
        }
        .btn-primary:hover { opacity: 0.9; }

        /* Panel */
        #panel {
            position: fixed; width: 90vw; height: 90vh; background: var(--bg-base);
            border: 1px solid var(--border); border-radius: 12px;
            display: none; flex-direction: column; color: var(--text-main);
            box-shadow: var(--shadow-float); overflow: hidden;
            resize: both; min-width: 500px; min-height: 300px;
            opacity: 0; transform: scale(0.97) translateY(10px); 
            transition: opacity 0.3s ease, transform 0.3s cubic-bezier(0.25, 0.8, 0.25, 1), 
                        width 0.3s ease, height 0.3s ease, left 0.3s ease, top 0.3s ease, border-radius 0.3s ease;
            z-index: 100;
        }
        #panel.visible { opacity: 1; transform: scale(1) translateY(0); }
        #panel.minimized { height: 48px !important; min-height: 48px !important; resize: none; overflow: hidden; }
        #panel.fullscreen { border-radius: 0; resize: none; border: none; }

        /* Toolbar Header */
        #header {
            height: 48px; background: var(--bg-panel); border-bottom: 1px solid var(--border);
            display: flex; align-items: center; padding: 0 16px;
            cursor: grab; user-select: none;
        }
        #header:active { cursor: grabbing; }

        /* Mac Traffic Lights */
        .mac-controls { display: flex; gap: 8px; margin-right: 24px; }
        .mac-btn { width: 12px; height: 12px; border-radius: 50%; cursor: pointer; transition: 0.1s; position: relative; }
        .mac-btn::after { content: ''; position: absolute; inset: 0; border-radius: 50%; opacity: 0; transition: 0.2s; background: rgba(0,0,0,0.2); }
        .mac-controls:hover .mac-btn::after { opacity: 1; }
        
        .mac-btn.close { background: #FF5F56; border: 1px solid #E0443E; }
        .mac-btn.min { background: #FFBD2E; border: 1px solid #DEA123; }
        .mac-btn.max { background: #28C840; border: 1px solid #1D9730; }

        .tabs-container { display: flex; gap: 4px; background: var(--bg-active); padding: 4px; border-radius: 8px; margin: 0 auto; }
        .tab-btn {
            display: flex; align-items: center; justify-content: center; gap: 6px; 
            padding: 4px 14px; background: transparent; border: none; color: var(--text-muted);
            border-radius: 6px; font-size: 12px; font-weight: 500; cursor: pointer; transition: all 0.2s;
        }
        .tab-btn:hover { color: var(--text-main); }
        .tab-btn.active { background: var(--bg-base); color: var(--text-main); box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
        
        .spacer { flex: 1; }

        /* Content Area & Panes */
        #content { flex: 1; overflow: hidden; display: flex; flex-direction: column; background: var(--bg-base); position: relative; }
        
        .panel-split { display: flex; height: 100%; overflow: hidden; width: 100%; }
        .pane { flex: 1; overflow: auto; padding: 16px; animation: paneFadeIn 0.3s ease; }
        .pane-sidebar { width: 280px; min-width: 200px; border-right: 1px solid var(--border); background: var(--bg-panel); overflow: auto; padding: 12px; }
        
        @keyframes paneFadeIn {
            from { opacity: 0; transform: translateY(5px); }
            to { opacity: 1; transform: translateY(0); }
        }

        /* Scrollbars */
        ::-webkit-scrollbar { width: 12px; height: 12px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: var(--border); border-radius: 6px; border: 3px solid var(--bg-base); }
        ::-webkit-scrollbar-thumb:hover { background: var(--text-muted); }

        /* Shared UI Elements */
        .list-item {
            padding: 8px 10px; border-radius: 6px; font-size: 13px; margin-bottom: 2px;
            cursor: pointer; color: var(--text-main); transition: background 0.15s;
            white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        .list-item:hover { background: var(--bg-hover); }
        .list-item.selected { background: var(--accent); color: var(--accent-text); }

        /* Syntax Highlighting */
        .hl-tag { color: var(--hl-tag); }
        .hl-attr { color: var(--hl-attr); }
        .hl-val { color: var(--hl-val); }
        .hl-kw { color: var(--hl-kw); font-weight: 600; }
        .hl-str { color: var(--hl-str); }
        .hl-num { color: var(--hl-num); }
        .hl-cmnt { color: var(--hl-cmnt); font-style: italic; }

        /* Tree View */
        .tree-node { font-family: var(--font-mono); font-size: 12px; line-height: 1.6; white-space: nowrap; }
        .tree-children { padding-left: 14px; margin-left: 5px; border-left: 1px solid var(--border); }
        .tree-text { color: var(--text-main); }
        .tree-toggle { display: inline-block; width: 14px; text-align: center; cursor: pointer; color: var(--text-muted); user-select: none; font-size: 10px; transition: transform 0.1s; }
        .tree-line { padding: 2px 4px; border-radius: 4px; transition: background 0.1s; }
        .tree-line:hover { background: var(--bg-hover); }
        .tree-line.selected { background: var(--bg-active); outline: 1px solid var(--border); }

        /* Object Inspector */
        .obj-tree { padding-left: 14px; margin-top: 2px; border-left: 1px dashed var(--border); }
        .obj-key { color: var(--hl-tag); }
        .obj-val.string { color: var(--hl-str); }
        .obj-val.number { color: var(--hl-num); }

        /* Tables */
        table { width: 100%; border-collapse: collapse; font-size: 12px; text-align: left; }
        th { padding: 10px 12px; border-bottom: 1px solid var(--border); color: var(--text-muted); font-weight: 500; position: sticky; top: 0; background: var(--bg-base); z-index: 2; }
        td { padding: 10px 12px; border-bottom: 1px solid var(--bg-hover); font-family: var(--font-mono); word-break: break-all; }
        tr { transition: background 0.1s; }
        tr:hover td { background: var(--bg-hover); }

        /* Top Bar */
        .top-bar { display: flex; gap: 8px; padding: 10px 16px; border-bottom: 1px solid var(--border); background: var(--bg-panel); align-items: center; }
        .action-btn { background: var(--bg-base); border: 1px solid var(--border); padding: 6px 12px; color: var(--text-main); border-radius: 6px; font-size: 12px; cursor: pointer; transition: 0.15s; }
        .action-btn:hover { background: var(--bg-hover); }
        
        .search-box { display: flex; align-items: center; background: var(--bg-base); border: 1px solid var(--border); border-radius: 6px; padding: 4px 8px; flex: 1; max-width: 300px; }
        .search-box svg { color: var(--text-muted); margin-right: 6px; }
        .search-box input { border: none; background: transparent; outline: none; color: var(--text-main); font-size: 12px; width: 100%; }

        /* Console */
        .log-row { padding: 10px 16px; border-bottom: 1px solid var(--border); font-family: var(--font-mono); font-size: 12px; display: flex; gap: 12px; animation: paneFadeIn 0.2s ease; }
        .log-time { color: var(--text-muted); user-select: none; white-space: nowrap; }
        .log-icon { margin-top: 2px; }
        .log-content { flex: 1; word-wrap: break-word; }
        .log-warn { background: rgba(255, 159, 10, 0.08); color: #B26B00; }
        @media (prefers-color-scheme: dark) { .log-warn { color: #FFD255; } }
        .log-error { background: rgba(255, 69, 58, 0.08); color: #D70015; }
        @media (prefers-color-scheme: dark) { .log-error { color: #FF453A; } }
        
        .empty-state { display: flex; align-items: center; justify-content: center; height: 100%; color: var(--text-muted); font-size: 14px; text-align: center; padding: 20px; }
    `;
    shadow.appendChild(styles);

    // --- DOM Assembly ---
    const launcher = document.createElement('div');
    launcher.id = 'launcher';
    launcher.innerHTML = ICONS.hammer;
    shadow.appendChild(launcher);

    const modalOverlay = document.createElement('div');
    modalOverlay.id = 'modal-overlay';
    modalOverlay.innerHTML = `
        <div class="modal-content">
            <div class="modal-icon">${ICONS.hammer}</div>
            <h2>Web Inspector</h2>
            <p>A beautifully designed tool for inspecting web pages. Includes DOM, Console, Network, and Storage tools.</p>
            <button class="btn-primary" id="btn-continue">Continue</button>
        </div>
    `;
    shadow.appendChild(modalOverlay);

    const panel = document.createElement('div');
    panel.id = 'panel';
    panel.innerHTML = `
        <div id="header">
            <div class="mac-controls">
                <div class="mac-btn close" id="btn-close" title="Close"></div>
                <div class="mac-btn min" id="btn-minimize" title="Minimize"></div>
                <div class="mac-btn max" id="btn-maximize" title="Full Screen"></div>
            </div>
            <div class="tabs-container">
                <button class="tab-btn active" data-tab="elements">${ICONS.elements} Elements</button>
                <button class="tab-btn" data-tab="console">${ICONS.console} Console</button>
                <button class="tab-btn" data-tab="sources">${ICONS.sources} Sources</button>
                <button class="tab-btn" data-tab="network">${ICONS.network} Network</button>
                <button class="tab-btn" data-tab="storage">${ICONS.storage} Storage</button>
                <button class="tab-btn" data-tab="performance">${ICONS.performance} Performance</button>
            </div>
            <div class="spacer"></div>
        </div>
        <div id="content"></div>
    `;
    shadow.appendChild(panel);

    const contentDiv = panel.querySelector('#content');
    const headerDiv = panel.querySelector('#header');

    // --- Drag & Drop Launcher ---
    let lDrag = { dragging: false, moved: false, startX: 0, startY: 0, initX: 0, initY: 0 };
    launcher.addEventListener('mousedown', (e) => {
        lDrag.dragging = true; lDrag.moved = false;
        lDrag.startX = e.clientX; lDrag.startY = e.clientY;
        const rect = launcher.getBoundingClientRect();
        lDrag.initX = rect.left; lDrag.initY = rect.top;
        launcher.style.transition = 'none';
    });
    window.addEventListener('mousemove', (e) => {
        if (!lDrag.dragging) return;
        const dx = e.clientX - lDrag.startX;
        const dy = e.clientY - lDrag.startY;
        if (Math.hypot(dx, dy) > 4) lDrag.moved = true;
        if (lDrag.moved) {
            launcher.style.left = `${lDrag.initX + dx}px`;
            launcher.style.top = `${lDrag.initY + dy}px`;
            launcher.style.bottom = 'auto'; launcher.style.right = 'auto';
        }
    });
    window.addEventListener('mouseup', () => {
        if (lDrag.dragging) {
            launcher.style.transition = '';
            lDrag.dragging = false;
        }
    });
    
    launcher.addEventListener('click', () => {
        if (lDrag.moved) return;
        if (!hasSeenIntro) {
            modalOverlay.classList.add('visible');
        } else {
            togglePanel(true);
        }
    });

    shadow.querySelector('#btn-continue').addEventListener('click', () => {
        hasSeenIntro = true;
        modalOverlay.classList.remove('visible');
        setTimeout(() => togglePanel(true), 150); 
    });

    // --- Window Controls ---
    panel.querySelector('#btn-close').addEventListener('click', () => togglePanel(false));
    
    panel.querySelector('#btn-minimize').addEventListener('click', () => {
        uiState.isMinimized = !uiState.isMinimized;
        panel.classList.toggle('minimized', uiState.isMinimized);
    });

    panel.querySelector('#btn-maximize').addEventListener('click', () => {
        uiState.isFullscreen = !uiState.isFullscreen;
        if (uiState.isFullscreen) {
            // Save state
            uiState.savedBounds = { left: panel.style.left, top: panel.style.top, width: panel.style.width, height: panel.style.height };
            panel.classList.add('fullscreen');
            panel.style.left = '0'; panel.style.top = '0'; 
            panel.style.width = '100vw'; panel.style.height = '100vh';
        } else {
            panel.classList.remove('fullscreen');
            panel.style.left = uiState.savedBounds.left || '5vw'; 
            panel.style.top = uiState.savedBounds.top || '5vh'; 
            panel.style.width = uiState.savedBounds.width || '90vw'; 
            panel.style.height = uiState.savedBounds.height || '90vh';
        }
    });

    window.addEventListener('keydown', (e) => {
        if (e.altKey && e.code === 'KeyJ') {
            e.preventDefault();
            if(!hasSeenIntro) modalOverlay.classList.add('visible');
            else togglePanel(!uiState.isOpen);
        }
    });

    function togglePanel(show) {
        uiState.isOpen = show;
        if (show) {
            panel.style.display = 'flex';
            // Force reflow
            void panel.offsetWidth;
            panel.classList.add('visible');
            launcher.style.display = 'none';
            renderActiveTab();
        } else {
            panel.classList.remove('visible');
            setTimeout(() => { panel.style.display = 'none'; launcher.style.display = 'flex'; }, 300);
        }
    }

    // Header Dragging
    let isDragging = false, dragStartX = 0, dragStartY = 0, initialLeft = 0, initialTop = 0;
    headerDiv.addEventListener('mousedown', (e) => {
        if (e.target.closest('button') || e.target.closest('.mac-btn') || uiState.isFullscreen) return;
        isDragging = true;
        dragStartX = e.clientX; dragStartY = e.clientY;
        const rect = panel.getBoundingClientRect();
        initialLeft = rect.left; initialTop = rect.top;
        panel.style.transition = 'none'; // remove transitions during drag
    });
    window.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        panel.style.left = `${initialLeft + (e.clientX - dragStartX)}px`;
        panel.style.top = `${initialTop + (e.clientY - dragStartY)}px`;
        panel.style.bottom = 'auto'; panel.style.right = 'auto';
    });
    window.addEventListener('mouseup', () => {
        if (isDragging) {
            panel.style.transition = 'opacity 0.3s ease, transform 0.3s cubic-bezier(0.25, 0.8, 0.25, 1), width 0.3s ease, height 0.3s ease, left 0.3s ease, top 0.3s ease, border-radius 0.3s ease';
            isDragging = false;
        }
    });

    // Tab Switching
    shadow.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            shadow.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            e.currentTarget.classList.add('active');
            uiState.activeTab = e.currentTarget.getAttribute('data-tab');
            renderActiveTab();
        });
    });

    function renderActiveTab() {
        contentDiv.innerHTML = '';
        const t = uiState.activeTab;
        if (t === 'elements') renderElementsTab();
        if (t === 'console') renderConsoleTab();
        if (t === 'sources') renderSourcesTab();
        if (t === 'network') renderNetworkTab();
        if (t === 'storage') renderStorageTab();
        if (t === 'performance') renderPerformanceTab();
    }

    // --- Utilities ---
    function el(tag, className = '', text = '') {
        const e = document.createElement(tag);
        if (className) e.className = className;
        if (text) e.textContent = text;
        return e;
    }

    function safeHTML(str) {
        return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    function createObjectTree(obj, depth = 0) {
        if (depth > 2 || obj === null || typeof obj !== 'object') {
            const span = el('span', `obj-val ${typeof obj}`);
            span.textContent = typeof obj === 'string' ? `"${obj}"` : String(obj);
            return span;
        }
        
        const wrap = el('div', 'obj-tree');
        try {
            for (const key in obj) {
                const line = el('div');
                const keySpan = el('span', 'obj-key', `${key}: `);
                line.appendChild(keySpan);
                line.appendChild(createObjectTree(obj[key], depth + 1));
                wrap.appendChild(line);
            }
        } catch(e) { wrap.textContent = "[Restricted]"; }
        return wrap;
    }

    // --- Tabs Implementation ---

    // 1. Elements
    function renderElementsTab() {
        const split = el('div', 'panel-split');
        const treePane = el('div', 'pane');
        const detailPane = el('div', 'pane-sidebar');
        detailPane.style.borderRight = 'none';
        detailPane.style.borderLeft = '1px solid var(--border)';
        
        detailPane.innerHTML = `<div class="empty-state">Select an element</div>`;
        
        function updateDetails(node) {
            if (node.nodeType !== Node.ELEMENT_NODE) return;
            uiState.selectedNode = node;
            
            treePane.querySelectorAll('.tree-line').forEach(l => l.classList.remove('selected'));
            const nodeLine = treePane.querySelector(`[data-node-id="${node.__jellyId}"]`);
            if (nodeLine) nodeLine.classList.add('selected');

            detailPane.innerHTML = '';
            const title = el('h3', '', node.tagName.toLowerCase());
            title.style.marginBottom = '16px';
            detailPane.appendChild(title);

            const styles = window.getComputedStyle(node);
            const props = ['display', 'position', 'width', 'height', 'margin', 'padding', 'color', 'background-color', 'font-family'];
            
            const table = el('table');
            table.innerHTML = `<tr><th>Style</th><th>Value</th></tr>`;
            props.forEach(p => {
                const tr = el('tr');
                tr.appendChild(el('td', '', p));
                tr.appendChild(el('td', '', styles.getPropertyValue(p)));
                table.appendChild(tr);
            });
            detailPane.appendChild(table);
        }

        let idCounter = 0;
        function buildNode(node) {
            if (node.nodeType === Node.TEXT_NODE) {
                const val = node.nodeValue.trim();
                if (!val) return null;
                const wrap = el('div', 'tree-node');
                wrap.appendChild(el('span', 'tree-text', val.substring(0, 80) + (val.length > 80 ? '...' : '')));
                return wrap;
            }
            if (node.nodeType !== Node.ELEMENT_NODE) return null;
            if (node === host) return null; // hide inspector

            if (!node.__jellyId) node.__jellyId = ++idCounter;

            const wrap = el('div', 'tree-node');
            const line = el('div', 'tree-line');
            line.dataset.nodeId = node.__jellyId;
            if (uiState.selectedNode === node) line.classList.add('selected');

            const hasChildren = node.childNodes.length > 0;
            const isExpanded = uiState.expandedNodes.has(node) || node === document.body || node === document.documentElement;

            const toggle = el('span', 'tree-toggle', hasChildren ? (isExpanded ? '▼' : '▶') : ' ');
            if(hasChildren) toggle.style.transform = isExpanded ? 'rotate(0)' : 'rotate(-90deg)';
            line.appendChild(toggle);

            const tagWrap = el('span', '');
            tagWrap.innerHTML = `<span class="hl-tag">&lt;${node.tagName.toLowerCase()}</span>`;
            
            Array.from(node.attributes).forEach(attr => {
                tagWrap.innerHTML += ` <span class="hl-attr">${attr.name}</span>="<span class="hl-val">${safeHTML(attr.value)}</span>"`;
            });
            tagWrap.innerHTML += `<span class="hl-tag">&gt;</span>`;
            line.appendChild(tagWrap);
            wrap.appendChild(line);

            line.addEventListener('click', (e) => { e.stopPropagation(); updateDetails(node); });

            const childrenWrap = el('div', 'tree-children');
            childrenWrap.style.display = isExpanded ? 'block' : 'none';
            wrap.appendChild(childrenWrap);

            let childrenRendered = false;
            function renderChildren() {
                if (childrenRendered) return;
                childrenRendered = true;
                node.childNodes.forEach(child => {
                    const cNode = buildNode(child);
                    if (cNode) childrenWrap.appendChild(cNode);
                });
                childrenWrap.innerHTML += `<div class="tree-line hl-tag">&lt;/${node.tagName.toLowerCase()}&gt;</div>`;
            }

            if (isExpanded && hasChildren) renderChildren();

            if (hasChildren) {
                toggle.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const willExpand = !uiState.expandedNodes.has(node);
                    if (willExpand) {
                        uiState.expandedNodes.add(node);
                        toggle.textContent = '▼'; toggle.style.transform = 'rotate(0)';
                        childrenWrap.style.display = 'block';
                        renderChildren();
                    } else {
                        uiState.expandedNodes.delete(node);
                        toggle.style.transform = 'rotate(-90deg)';
                        childrenWrap.style.display = 'none';
                    }
                });
            }
            return wrap;
        }

        const rootHtml = buildNode(document.documentElement);
        if (rootHtml) treePane.appendChild(rootHtml);

        split.appendChild(treePane);
        split.appendChild(detailPane);
        contentDiv.appendChild(split);
    }

    // 2. Console
    function renderConsoleTab() {
        if(uiState.activeTab !== 'console') return;
        contentDiv.innerHTML = '';
        
        const topBar = el('div', 'top-bar');
        const clearBtn = el('button', 'action-btn', 'Clear');
        clearBtn.addEventListener('click', () => { logs.length = 0; renderConsoleTab(); });
        
        const searchBox = el('div', 'search-box');
        searchBox.innerHTML = ICONS.search;
        const searchInput = el('input');
        searchInput.type = 'text'; searchInput.placeholder = 'Filter output...';
        searchInput.value = uiState.consoleFilter;
        
        searchInput.addEventListener('input', (e) => {
            uiState.consoleFilter = e.target.value.toLowerCase();
            renderConsoleList();
        });

        searchBox.appendChild(searchInput);
        topBar.appendChild(clearBtn);
        topBar.appendChild(searchBox);
        contentDiv.appendChild(topBar);

        const list = el('div', 'pane');
        contentDiv.appendChild(list);

        function renderConsoleList() {
            list.innerHTML = '';
            const filtered = logs.filter(l => {
                if(!uiState.consoleFilter) return true;
                return JSON.stringify(l.args).toLowerCase().includes(uiState.consoleFilter);
            });

            if (filtered.length === 0) {
                list.innerHTML = `<div class="empty-state">Console is clear</div>`;
                return;
            }

            filtered.forEach(l => {
                const row = el('div', `log-row log-${l.type}`);
                
                // Icon
                let icon = ICONS.log_debug;
                if(l.type==='info') icon = ICONS.log_info;
                if(l.type==='warn') icon = ICONS.log_warn;
                if(l.type==='error') icon = ICONS.log_err;
                
                row.innerHTML = `<div class="log-icon">${icon}</div><div class="log-time">${l.time.toLocaleTimeString()}</div>`;
                
                const content = el('div', 'log-content');
                l.args.forEach(a => {
                    if (typeof a === 'object') {
                        const toggle = el('span', 'hl-kw', 'Object ▶ ');
                        toggle.style.cursor = 'pointer';
                        const tree = createObjectTree(a);
                        tree.style.display = 'none';
                        toggle.addEventListener('click', () => {
                            const isVis = tree.style.display === 'block';
                            tree.style.display = isVis ? 'none' : 'block';
                            toggle.textContent = isVis ? 'Object ▶ ' : 'Object ▼ ';
                        });
                        content.appendChild(toggle);
                        content.appendChild(tree);
                    } else {
                        const span = el('span', '', String(a) + ' ');
                        content.appendChild(span);
                    }
                });
                row.appendChild(content);
                list.appendChild(row);
            });
            list.scrollTop = list.scrollHeight;
        }
        renderConsoleList();
        
        // Focus search if it was active
        if(uiState.consoleFilter) searchInput.focus();
    }

    // 3. Sources
    function renderSourcesTab() {
        contentDiv.innerHTML = '';
        const split = el('div', 'panel-split');
        
        const listPane = el('div', 'pane-sidebar');
        const codePane = el('div', 'pane');
        codePane.style.fontFamily = 'var(--font-mono)';
        codePane.style.whiteSpace = 'pre-wrap';
        codePane.style.fontSize = '12px';
        codePane.style.lineHeight = '1.5';
        
        const title = el('div', '', 'Page Resources');
        title.style.fontWeight = '600'; title.style.marginBottom = '12px';
        listPane.appendChild(title);

        const resources = [
            location.href, // index.html
            ...Array.from(document.scripts).map(s => s.src).filter(Boolean),
            ...Array.from(document.styleSheets).map(s => s.href).filter(Boolean),
            ...Array.from(document.images).map(img => img.src).filter(Boolean)
        ];
        const uniqueRes = [...new Set(resources)];

        if (uniqueRes.length === 0) listPane.innerHTML += `<div class="text-muted">No sources found.</div>`;

        // Syntax Highlighter
        function highlightSyntax(text, isHTML) {
            let res = safeHTML(text);
            if (isHTML) {
                // HTML Tags & Attrs
                res = res.replace(/(&lt;\/?)([a-zA-Z0-9-]+)/g, '$1<span class="hl-tag">$2</span>');
                res = res.replace(/([a-zA-Z0-9-]+)=/g, '<span class="hl-attr">$1</span>=');
                res = res.replace(/(&quot;.*?&quot;)/g, '<span class="hl-str">$1</span>');
            } else {
                // JS / JSON
                res = res.replace(/(&quot;.*?&quot;|&#39;.*?&#39;)/g, '<span class="hl-str">$1</span>');
                res = res.replace(/\b(const|let|var|function|return|if|else|for|while|new|class|import|export|true|false|null)\b/g, '<span class="hl-kw">$1</span>');
                res = res.replace(/\b(\d+)\b/g, '<span class="hl-num">$1</span>');
                res = res.replace(/(\/\/.*|\/\*[\s\S]*?\*\/)/g, '<span class="hl-cmnt">$1</span>');
            }
            return res;
        }

        uniqueRes.forEach((url, i) => {
            const display = url === location.href ? (location.pathname === '/' ? 'index.html' : location.pathname.split('/').pop()) : url.split('/').pop() || url;
            const item = el('div', 'list-item', display);
            item.title = url;
            if (i === 0) item.classList.add('selected');

            item.addEventListener('click', async () => {
                listPane.querySelectorAll('.list-item').forEach(n => n.classList.remove('selected'));
                item.classList.add('selected');
                
                const ext = url.split('.').pop().toLowerCase();
                const isImage = ['png','jpg','jpeg','gif','svg','webp','ico'].includes(ext) || url.startsWith('data:image');

                if (isImage) {
                    codePane.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;height:100%;">
                        <img src="${url}" style="max-width:90%; max-height:90%; object-fit:contain; border:1px solid var(--border); background: repeating-conic-gradient(#80808033 0% 25%, transparent 0% 50%) 50% / 20px 20px;" />
                    </div>`;
                    return;
                }

                codePane.innerHTML = `<div style="color:var(--text-muted)">Loading...</div>`;
                try {
                    const res = await fetch(url);
                    if (!res.ok) throw new Error(`HTTP ${res.status}`);
                    const text = await res.text();
                    
                    // Don't highlight huge minified files (performance safety)
                    if(text.length > 100000) {
                        codePane.innerHTML = safeHTML(text);
                    } else {
                        const isHTML = url.endsWith('.html') || url === location.href;
                        codePane.innerHTML = highlightSyntax(text, isHTML);
                    }
                } catch (e) {
                    codePane.innerHTML = `<div style="color:#FF3B30">Cross-origin blocked or unreachable.<br><br>${e.message}</div>`;
                }
            });
            listPane.appendChild(item);
        });

        split.appendChild(listPane);
        split.appendChild(codePane);
        contentDiv.appendChild(split);
        
        const firstItem = listPane.querySelector('.list-item');
        if (firstItem) firstItem.click();
    }

    // 4. Network
    function renderNetworkTab() {
        contentDiv.innerHTML = '';
        const topBar = el('div', 'top-bar');
        const refreshBtn = el('button', 'action-btn', 'Refresh List');
        topBar.appendChild(refreshBtn);
        contentDiv.appendChild(topBar);

        const list = el('div', 'pane');
        refreshBtn.addEventListener('click', renderNetworkTab);

        if (networkEntries.length === 0) {
            list.innerHTML = `<div class="empty-state">No network activity recorded</div>`;
        } else {
            const table = el('table');
            table.innerHTML = `<tr><th>Name</th><th>Type</th><th>Time</th><th>Size</th></tr>`;
            
            const seen = new Set();
            networkEntries.slice().reverse().forEach(entry => {
                if(seen.has(entry.name)) return;
                seen.add(entry.name);
                
                const tr = el('tr');
                let name = entry.name;
                if(name === location.href) name = location.pathname === '/' ? '(index)' : location.pathname.split('/').pop();
                else name = name.split('/').pop() || name;

                const tdName = el('td', '', name);
                tdName.title = entry.name;
                
                tr.appendChild(tdName);
                
                // Highlight WebSocket rows
                if(entry.type === 'websocket') {
                    tr.style.background = 'rgba(10, 132, 255, 0.1)';
                    tr.appendChild(el('td', 'hl-kw', 'websocket'));
                } else {
                    tr.appendChild(el('td', '', entry.initiatorType || entry.entryType));
                }
                
                tr.appendChild(el('td', '', entry.duration ? Math.round(entry.duration) + ' ms' : entry.time));
                
                const size = entry.transferSize ? (entry.transferSize / 1024).toFixed(1) + ' KB' : (entry.type==='websocket'?'—':'Cached / Ext');
                tr.appendChild(el('td', '', size));
                
                table.appendChild(tr);
            });
            list.appendChild(table);
        }
        contentDiv.appendChild(list);
    }

    // 5. Storage
    function renderStorageTab() {
        contentDiv.innerHTML = '';
        const split = el('div', 'panel-split');
        const sidePane = el('div', 'pane-sidebar');
        const dataPane = el('div', 'pane');
        
        ['Local Storage', 'Session Storage', 'Cookies'].forEach((type, idx) => {
            const btn = el('div', 'list-item', type);
            if (idx === 0) btn.classList.add('selected');
            btn.addEventListener('click', () => {
                sidePane.querySelectorAll('.list-item').forEach(n => n.classList.remove('selected'));
                btn.classList.add('selected');
                showStorage(type);
            });
            sidePane.appendChild(btn);
        });

        function showStorage(type) {
            dataPane.innerHTML = '';
            const table = el('table');
            table.innerHTML = `<tr><th>Key</th><th>Value</th></tr>`;
            
            try {
                let items = [];
                if (type === 'Local Storage') {
                    for (let i = 0; i < localStorage.length; i++) {
                        const k = localStorage.key(i); items.push({ k, v: localStorage.getItem(k) });
                    }
                } else if (type === 'Session Storage') {
                    for (let i = 0; i < sessionStorage.length; i++) {
                        const k = sessionStorage.key(i); items.push({ k, v: sessionStorage.getItem(k) });
                    }
                } else if (type === 'Cookies') {
                    document.cookie.split(';').forEach(p => {
                        const [k, v] = p.split('=');
                        if (k && v) items.push({ k: k.trim(), v: v.trim() });
                    });
                }

                if (items.length === 0) {
                    dataPane.innerHTML = `<div class="empty-state">No items stored</div>`;
                    return;
                }

                items.forEach(item => {
                    const tr = el('tr');
                    tr.appendChild(el('td', '', item.k));
                    tr.appendChild(el('td', '', item.v));
                    table.appendChild(tr);
                });
                dataPane.appendChild(table);
            } catch (e) {
                dataPane.innerHTML = `<div class="empty-state" style="color:#FF3B30">Access Denied: ${e.message}</div>`;
            }
        }

        showStorage('Local Storage');
        split.appendChild(sidePane);
        split.appendChild(dataPane);
        contentDiv.appendChild(split);
    }

    // 6. Performance
    function renderPerformanceTab() {
        contentDiv.innerHTML = '';
        const pane = el('div', 'pane');
        
        const table = el('table');
        table.innerHTML = `<tr><th>Metric</th><th>Value</th></tr>`;
        function addRow(name, val) {
            const tr = el('tr');
            tr.appendChild(el('td', '', name));
            tr.appendChild(el('td', 'hl-num', val));
            table.appendChild(tr);
        }

        const navEntries = performance.getEntriesByType('navigation');
        if (navEntries.length > 0) {
            const nav = navEntries[0];
            addRow('DOM Interactive', Math.round(nav.domInteractive) + ' ms');
            addRow('DOM Content Loaded', Math.round(nav.domContentLoadedEventEnd) + ' ms');
            addRow('Load Event End', Math.round(nav.loadEventEnd) + ' ms');
        }

        addRow('Viewport Size', `${window.innerWidth} x ${window.innerHeight}`);
        addRow('Screen Size', `${window.screen.width} x ${window.screen.height}`);
        addRow('Device Memory', navigator.deviceMemory ? navigator.deviceMemory + ' GB' : 'Unknown');
        addRow('Hardware Cores', navigator.hardwareConcurrency ? navigator.hardwareConcurrency : 'Unknown');
        addRow('Connection', navigator.onLine ? 'Online' : 'Offline');

        pane.appendChild(table);
        contentDiv.appendChild(pane);
    }

})();

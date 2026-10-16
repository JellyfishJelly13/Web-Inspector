/**
 * Jellyfish Web Inspector
 * A lightweight, read-only, embeddable web inspector.
 * Designed for Vercel deployment.
 */
(function () {
    if (window.__JellyfishWebInspector__) return;
    window.__JellyfishWebInspector__ = true;

    // --- State & Captures (Passive/Read-only) ---
    const MAX_LOGS = 1000;
    const logs = [];
    const networkEntries = [];
    
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
        logs.push({ type: 'error', time: new Date(), args: [e.message, e.filename, e.lineno] });
        if (uiState.isOpen && uiState.activeTab === 'console') renderConsoleTab();
    });

    window.addEventListener('unhandledrejection', (e) => {
        logs.push({ type: 'error', time: new Date(), args: ['Unhandled Promise Rejection:', e.reason] });
        if (uiState.isOpen && uiState.activeTab === 'console') renderConsoleTab();
    });

    // Capture Network (Passive Performance API)
    if ('PerformanceObserver' in window) {
        const observer = new PerformanceObserver((list) => {
            for (const entry of list.getEntries()) {
                networkEntries.push(entry);
            }
        });
        observer.observe({ entryTypes: ['resource', 'navigation'] });
    }

    // --- UI State & Constants ---
    const uiState = {
        isOpen: false,
        isMinimized: false,
        activeTab: 'elements',
        expandedNodes: new WeakSet(),
        selectedNode: null
    };

    // Vercel-inspired SVGs
    const ICONS = {
        elements: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"/></svg>`,
        console: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>`,
        sources: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"/></svg>`,
        network: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>`,
        storage: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4"/></svg>`,
        performance: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>`,
        close: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>`,
        minimize: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M20 12H4"/></svg>`,
        jellyfish: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M12 2C8 2 5 6 5 10c0 2.5 1.5 4.5 3 6m8-6c0 2.5-1.5 4.5-3 6M12 2v20m-3-6l-1 5m7-5l1 5"/></svg>`
    };

    // --- DOM Setup ---
    const host = document.createElement('div');
    host.id = 'jellyfish-inspector-host';
    host.style.position = 'fixed';
    host.style.zIndex = '2147483647';
    document.documentElement.appendChild(host);

    const shadow = host.attachShadow({ mode: 'open' });

    const styles = document.createElement('style');
    styles.textContent = `
        :host {
            --bg: rgba(10, 10, 10, 0.85);
            --bg-solid: #111;
            --bg-hover: rgba(255, 255, 255, 0.1);
            --border: rgba(255, 255, 255, 0.12);
            --text-main: #ededed;
            --text-muted: #a1a1aa;
            --accent: #0070f3;
            --font: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            --font-mono: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
        }
        * { box-sizing: border-box; margin: 0; padding: 0; font-family: var(--font); }
        
        /* Floating Button */
        #launcher {
            position: fixed; bottom: 20px; right: 20px; width: 44px; height: 44px;
            background: var(--bg); backdrop-filter: saturate(180%) blur(12px);
            -webkit-backdrop-filter: saturate(180%) blur(12px);
            border: 1px solid var(--border); border-radius: 50%;
            display: flex; align-items: center; justify-content: center;
            color: var(--text-main); cursor: pointer;
            box-shadow: 0 4px 24px rgba(0,0,0,0.4); transition: transform 0.2s;
        }
        #launcher:hover { transform: scale(1.05); }
        #launcher svg { width: 22px; height: 22px; }

        /* Panel */
        #panel {
            position: fixed; top: 5vh; left: 5vw; width: 90vw; height: 90vh;
            max-width: 1200px; background: var(--bg);
            backdrop-filter: saturate(180%) blur(20px); -webkit-backdrop-filter: saturate(180%) blur(20px);
            border: 1px solid var(--border); border-radius: 12px;
            display: none; flex-direction: column; color: var(--text-main);
            box-shadow: 0 20px 40px rgba(0,0,0,0.5); overflow: hidden;
            resize: both; min-width: 320px; min-height: 200px;
        }
        #panel.minimized {
            height: 48px !important; min-height: 48px !important; resize: none; overflow: hidden;
        }

        /* Header */
        #header {
            height: 48px; background: rgba(0,0,0,0.2); border-bottom: 1px solid var(--border);
            display: flex; align-items: center; padding: 0 12px;
            cursor: grab; user-select: none;
        }
        #header:active { cursor: grabbing; }
        
        .tab-btn {
            display: flex; align-items: center; gap: 6px; padding: 6px 12px;
            background: transparent; border: none; color: var(--text-muted);
            border-radius: 6px; font-size: 13px; cursor: pointer; transition: 0.15s;
        }
        .tab-btn:hover { background: var(--bg-hover); color: var(--text-main); }
        .tab-btn.active { color: var(--text-main); background: rgba(255,255,255,0.08); }
        .tab-btn svg { width: 16px; height: 16px; }

        .spacer { flex: 1; }
        .read-only-badge {
            font-size: 11px; padding: 2px 8px; border-radius: 12px;
            background: rgba(255,255,255,0.1); color: var(--text-muted); margin-right: 12px;
            pointer-events: none;
        }

        .window-ctrl {
            background: transparent; border: none; color: var(--text-muted);
            width: 28px; height: 28px; border-radius: 6px; display: flex;
            align-items: center; justify-content: center; cursor: pointer;
        }
        .window-ctrl:hover { background: var(--bg-hover); color: var(--text-main); }
        .window-ctrl svg { width: 16px; height: 16px; }

        /* Content Area */
        #content { flex: 1; overflow: hidden; display: flex; flex-direction: column; position: relative; }
        
        /* Scrollbar */
        ::-webkit-scrollbar { width: 10px; height: 10px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.2); border-radius: 5px; border: 2px solid var(--bg-solid); }
        ::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.3); }

        /* Common Elements */
        .panel-split { display: flex; height: 100%; overflow: hidden; }
        .pane { flex: 1; overflow: auto; padding: 12px; }
        .pane-sidebar { width: 300px; border-left: 1px solid var(--border); overflow: auto; padding: 12px; background: rgba(0,0,0,0.1); }
        
        /* Tree View (Elements) */
        .tree-node { font-family: var(--font-mono); font-size: 12px; line-height: 1.5; white-space: nowrap; }
        .tree-children { padding-left: 16px; border-left: 1px dashed rgba(255,255,255,0.1); margin-left: 6px; }
        .tree-tag { color: #569cd6; cursor: pointer; }
        .tree-attr-name { color: #9cdcfe; }
        .tree-attr-val { color: #ce9178; }
        .tree-text { color: var(--text-main); }
        .tree-toggle { display: inline-block; width: 12px; text-align: center; cursor: pointer; color: var(--text-muted); user-select: none; }
        .tree-line:hover { background: rgba(255,255,255,0.05); }
        .tree-line.selected { background: rgba(0, 112, 243, 0.3); }

        /* Key-Value Tables (Storage/Network) */
        table { width: 100%; border-collapse: collapse; font-size: 13px; text-align: left; }
        th { padding: 8px; border-bottom: 1px solid var(--border); color: var(--text-muted); font-weight: normal; position: sticky; top: 0; background: var(--bg-solid); z-index: 2; }
        td { padding: 8px; border-bottom: 1px solid rgba(255,255,255,0.05); font-family: var(--font-mono); font-size: 12px; word-break: break-all; }
        tr:hover td { background: rgba(255,255,255,0.03); }

        /* Console */
        .log-row { padding: 6px 12px; border-bottom: 1px solid rgba(255,255,255,0.05); font-family: var(--font-mono); font-size: 12px; display: flex; gap: 8px; }
        .log-row:hover { background: rgba(255,255,255,0.03); }
        .log-time { color: var(--text-muted); user-select: none; }
        .log-warn { background: rgba(255, 186, 0, 0.1); color: #ffba00; }
        .log-error { background: rgba(255, 0, 0, 0.1); color: #ff5555; }
        
        .top-bar { display: flex; gap: 8px; padding: 8px 12px; border-bottom: 1px solid var(--border); background: rgba(0,0,0,0.1); }
        input[type="text"] { background: rgba(255,255,255,0.05); border: 1px solid var(--border); color: var(--text-main); padding: 4px 8px; border-radius: 4px; font-size: 12px; outline: none; }
        input[type="text"]:focus { border-color: rgba(255,255,255,0.3); }
        button.action { background: rgba(255,255,255,0.1); border: none; padding: 4px 10px; color: var(--text-main); border-radius: 4px; font-size: 12px; cursor: pointer; }
        button.action:hover { background: rgba(255,255,255,0.15); }
        
        .empty-state { padding: 40px; text-align: center; color: var(--text-muted); font-size: 14px; }
    `;
    shadow.appendChild(styles);

    // --- UI Construction ---
    const launcher = document.createElement('div');
    launcher.id = 'launcher';
    launcher.innerHTML = ICONS.jellyfish;
    shadow.appendChild(launcher);

    const panel = document.createElement('div');
    panel.id = 'panel';
    panel.innerHTML = `
        <div id="header">
            <button class="tab-btn active" data-tab="elements">${ICONS.elements} Elements</button>
            <button class="tab-btn" data-tab="console">${ICONS.console} Console</button>
            <button class="tab-btn" data-tab="sources">${ICONS.sources} Sources</button>
            <button class="tab-btn" data-tab="network">${ICONS.network} Network</button>
            <button class="tab-btn" data-tab="storage">${ICONS.storage} Storage</button>
            <button class="tab-btn" data-tab="performance">${ICONS.performance} Performance</button>
            <div class="spacer"></div>
            <span class="read-only-badge">Read-Only</span>
            <button class="window-ctrl" id="btn-minimize" title="Minimize">${ICONS.minimize}</button>
            <button class="window-ctrl" id="btn-close" title="Close">${ICONS.close}</button>
        </div>
        <div id="content"></div>
    `;
    shadow.appendChild(panel);

    const contentDiv = panel.querySelector('#content');
    const headerDiv = panel.querySelector('#header');

    // --- Interactions ---
    launcher.addEventListener('click', () => togglePanel(true));
    panel.querySelector('#btn-close').addEventListener('click', () => togglePanel(false));
    panel.querySelector('#btn-minimize').addEventListener('click', () => {
        uiState.isMinimized = !uiState.isMinimized;
        panel.classList.toggle('minimized', uiState.isMinimized);
    });

    window.addEventListener('keydown', (e) => {
        if (e.altKey && e.code === 'KeyJ') {
            e.preventDefault();
            togglePanel(!uiState.isOpen);
        }
    });

    function togglePanel(show) {
        uiState.isOpen = show;
        panel.style.display = show ? 'flex' : 'none';
        launcher.style.display = show ? 'none' : 'flex';
        if (show) renderActiveTab();
    }

    // Dragging
    let isDragging = false, dragStartX = 0, dragStartY = 0, initialLeft = 0, initialTop = 0;
    headerDiv.addEventListener('mousedown', (e) => {
        if (e.target.closest('button')) return; // Ignore button clicks
        isDragging = true;
        dragStartX = e.clientX; dragStartY = e.clientY;
        const rect = panel.getBoundingClientRect();
        initialLeft = rect.left; initialTop = rect.top;
        panel.style.transition = 'none';
    });
    window.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        const dx = e.clientX - dragStartX;
        const dy = e.clientY - dragStartY;
        panel.style.left = `${initialLeft + dx}px`;
        panel.style.top = `${initialTop + dy}px`;
        panel.style.bottom = 'auto'; panel.style.right = 'auto'; // release CSS constraints
    });
    window.addEventListener('mouseup', () => {
        if (isDragging) panel.style.transition = '';
        isDragging = false;
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

    // --- Utility: Safely Set Text ---
    function el(tag, className = '', text = '') {
        const e = document.createElement(tag);
        if (className) e.className = className;
        if (text) e.textContent = text;
        return e;
    }

    // --- Tabs Implementation ---

    // 1. Elements Tab
    function renderElementsTab() {
        const split = el('div', 'panel-split');
        const treePane = el('div', 'pane');
        const detailPane = el('div', 'pane-sidebar');
        
        detailPane.innerHTML = `<div class="empty-state">Select an element to view properties</div>`;
        
        function updateDetails(node) {
            if (node.nodeType !== Node.ELEMENT_NODE) return;
            uiState.selectedNode = node;
            
            // Highlight
            treePane.querySelectorAll('.tree-line').forEach(l => l.classList.remove('selected'));
            const nodeLine = treePane.querySelector(`[data-node-id="${node.__jellyId}"]`);
            if (nodeLine) nodeLine.classList.add('selected');

            // Details
            detailPane.innerHTML = '';
            detailPane.appendChild(el('h3', '', node.tagName.toLowerCase()));
            const styles = window.getComputedStyle(node);
            const propsToShow = ['display', 'position', 'width', 'height', 'margin', 'padding', 'color', 'background-color', 'font-family', 'font-size', 'z-index'];
            
            const table = el('table');
            table.innerHTML = `<tr><th>Property</th><th>Value</th></tr>`;
            propsToShow.forEach(p => {
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
                wrap.appendChild(el('span', 'tree-text', val.substring(0, 100) + (val.length > 100 ? '...' : '')));
                return wrap;
            }
            if (node.nodeType !== Node.ELEMENT_NODE) return null;
            if (node === host) return null; // Hide inspector itself

            if (!node.__jellyId) node.__jellyId = ++idCounter;

            const wrap = el('div', 'tree-node');
            const line = el('div', 'tree-line');
            line.dataset.nodeId = node.__jellyId;
            if (uiState.selectedNode === node) line.classList.add('selected');

            const hasChildren = node.childNodes.length > 0;
            const isExpanded = uiState.expandedNodes.has(node) || node === document.body || node === document.documentElement;

            const toggle = el('span', 'tree-toggle', hasChildren ? (isExpanded ? '▼' : '▶') : ' ');
            line.appendChild(toggle);

            const tagWrap = el('span', 'tree-tag');
            tagWrap.appendChild(el('span', '', '<' + node.tagName.toLowerCase()));
            
            Array.from(node.attributes).forEach(attr => {
                tagWrap.appendChild(document.createTextNode(' '));
                tagWrap.appendChild(el('span', 'tree-attr-name', attr.name));
                tagWrap.appendChild(document.createTextNode('="'));
                tagWrap.appendChild(el('span', 'tree-attr-val', attr.value));
                tagWrap.appendChild(document.createTextNode('"'));
            });
            tagWrap.appendChild(document.createTextNode('>'));
            
            line.appendChild(tagWrap);
            wrap.appendChild(line);

            line.addEventListener('click', (e) => {
                e.stopPropagation();
                updateDetails(node);
            });

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
                childrenWrap.appendChild(el('div', 'tree-line tree-tag', `</${node.tagName.toLowerCase()}>`));
            }

            if (isExpanded && hasChildren) renderChildren();

            if (hasChildren) {
                toggle.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const willExpand = !uiState.expandedNodes.has(node);
                    if (willExpand) {
                        uiState.expandedNodes.add(node);
                        toggle.textContent = '▼';
                        childrenWrap.style.display = 'block';
                        renderChildren();
                    } else {
                        uiState.expandedNodes.delete(node);
                        toggle.textContent = '▶';
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

    // 2. Console Tab
    function renderConsoleTab() {
        if(uiState.activeTab !== 'console') return;
        contentDiv.innerHTML = '';
        
        const topBar = el('div', 'top-bar');
        const clearBtn = el('button', 'action', 'Clear UI Logs');
        const note = el('span', '', ' (Intercepting logs securely. Read-only)');
        note.style.color = 'var(--text-muted)';
        note.style.fontSize = '12px';
        note.style.lineHeight = '24px';
        
        clearBtn.addEventListener('click', () => { logs.length = 0; renderConsoleTab(); });
        topBar.appendChild(clearBtn);
        topBar.appendChild(note);
        contentDiv.appendChild(topBar);

        const list = el('div', 'pane');
        if (logs.length === 0) {
            list.innerHTML = `<div class="empty-state">No logs captured yet</div>`;
        } else {
            logs.forEach(l => {
                const row = el('div', `log-row log-${l.type}`);
                const time = el('span', 'log-time', l.time.toLocaleTimeString() + ' ');
                row.appendChild(time);

                const msg = el('span', '');
                // Basic stringification to keep it safe and readable
                msg.textContent = l.args.map(a => {
                    if (typeof a === 'object') {
                        try { return JSON.stringify(a); } catch (e) { return String(a); }
                    }
                    return String(a);
                }).join(' ');

                row.appendChild(msg);
                list.appendChild(row);
            });
        }
        contentDiv.appendChild(list);
        list.scrollTop = list.scrollHeight;
    }

    // 3. Sources Tab
    function renderSourcesTab() {
        contentDiv.innerHTML = '';
        const split = el('div', 'panel-split');
        
        const listPane = el('div', 'pane-sidebar');
        const codePane = el('div', 'pane');
        codePane.style.fontFamily = 'var(--font-mono)';
        codePane.style.whiteSpace = 'pre-wrap';
        codePane.style.fontSize = '12px';
        
        listPane.appendChild(el('h3', '', 'Scripts & Styles'));
        listPane.appendChild(document.createElement('br'));

        const resources = [
            ...Array.from(document.scripts).map(s => s.src).filter(Boolean),
            ...Array.from(document.styleSheets).map(s => s.href).filter(Boolean)
        ];
        // Unique
        const uniqueRes = [...new Set(resources)];

        if (uniqueRes.length === 0) {
            listPane.appendChild(el('div', 'tree-text', 'No external sources found.'));
        }

        uniqueRes.forEach(url => {
            const item = el('div', 'tree-line', url.split('/').pop() || url);
            item.style.cursor = 'pointer';
            item.title = url;
            item.addEventListener('click', async () => {
                listPane.querySelectorAll('.tree-line').forEach(n => n.classList.remove('selected'));
                item.classList.add('selected');
                codePane.innerHTML = `<div style="color:var(--text-muted)">Loading... (Subject to CORS)</div>`;
                try {
                    const res = await fetch(url);
                    if (!res.ok) throw new Error(`HTTP ${res.status}`);
                    const text = await res.text();
                    codePane.textContent = text;
                } catch (e) {
                    codePane.innerHTML = `<div style="color:#ff5555">Cannot read cross-origin or blocked resource.<br><br>Error: ${e.message}<br><br>URL: ${url}</div>`;
                }
            });
            listPane.appendChild(item);
        });

        split.appendChild(listPane);
        split.appendChild(codePane);
        contentDiv.appendChild(split);
    }

    // 4. Network Tab
    function renderNetworkTab() {
        contentDiv.innerHTML = '';
        const topBar = el('div', 'top-bar');
        const refreshBtn = el('button', 'action', 'Refresh');
        topBar.appendChild(refreshBtn);
        contentDiv.appendChild(topBar);

        const list = el('div', 'pane');
        refreshBtn.addEventListener('click', renderNetworkTab);

        if (networkEntries.length === 0) {
            list.innerHTML = `<div class="empty-state">No passive network activity observed yet.</div>`;
        } else {
            const table = el('table');
            table.innerHTML = `<tr><th>File / URL</th><th>Type</th><th>Duration</th><th>Transfer</th></tr>`;
            networkEntries.slice().reverse().forEach(entry => {
                const tr = el('tr');
                const name = entry.name.split('/').pop() || entry.name;
                
                const tdName = el('td', '', name);
                tdName.title = entry.name;
                
                tr.appendChild(tdName);
                tr.appendChild(el('td', '', entry.initiatorType || 'other'));
                tr.appendChild(el('td', '', Math.round(entry.duration) + 'ms'));
                
                const size = entry.transferSize ? (entry.transferSize / 1024).toFixed(1) + ' KB' : 'Cached/Cross-origin';
                tr.appendChild(el('td', '', size));
                
                table.appendChild(tr);
            });
            list.appendChild(table);
        }
        contentDiv.appendChild(list);
    }

    // 5. Storage Tab
    function renderStorageTab() {
        contentDiv.innerHTML = '';
        const split = el('div', 'panel-split');
        
        const sidePane = el('div', 'pane-sidebar');
        const dataPane = el('div', 'pane');
        
        ['Local Storage', 'Session Storage', 'Cookies'].forEach((type, idx) => {
            const btn = el('div', 'tree-line', type);
            btn.style.cursor = 'pointer';
            if (idx === 0) btn.classList.add('selected');
            btn.addEventListener('click', () => {
                sidePane.querySelectorAll('.tree-line').forEach(n => n.classList.remove('selected'));
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
                        const k = localStorage.key(i);
                        items.push({ k, v: localStorage.getItem(k) });
                    }
                } else if (type === 'Session Storage') {
                    for (let i = 0; i < sessionStorage.length; i++) {
                        const k = sessionStorage.key(i);
                        items.push({ k, v: sessionStorage.getItem(k) });
                    }
                } else if (type === 'Cookies') {
                    const parts = document.cookie.split(';');
                    parts.forEach(p => {
                        const [k, v] = p.split('=');
                        if (k && v) items.push({ k: k.trim(), v: v.trim() });
                    });
                }

                if (items.length === 0) {
                    dataPane.innerHTML = `<div class="empty-state">No entries found</div>`;
                    return;
                }

                items.forEach(item => {
                    const tr = el('tr');
                    tr.appendChild(el('td', '', item.k));
                    tr.appendChild(el('td', '', item.v.substring(0, 150) + (item.v.length > 150 ? '...' : '')));
                    table.appendChild(tr);
                });
                dataPane.appendChild(table);

            } catch (e) {
                dataPane.innerHTML = `<div class="empty-state" style="color:#ff5555">Access Denied: ${e.message}</div>`;
            }
        }

        showStorage('Local Storage');
        split.appendChild(sidePane);
        split.appendChild(dataPane);
        contentDiv.appendChild(split);
    }

    // 6. Performance Tab
    function renderPerformanceTab() {
        contentDiv.innerHTML = '';
        const pane = el('div', 'pane');
        
        const table = el('table');
        table.innerHTML = `<tr><th>Metric</th><th>Value</th></tr>`;
        
        function addRow(name, val) {
            const tr = el('tr');
            tr.appendChild(el('td', '', name));
            tr.appendChild(el('td', '', val));
            table.appendChild(tr);
        }

        // Navigation Timing (Level 2)
        const navEntries = performance.getEntriesByType('navigation');
        if (navEntries.length > 0) {
            const nav = navEntries[0];
            addRow('DOM Interactive', Math.round(nav.domInteractive) + ' ms');
            addRow('DOM Content Loaded', Math.round(nav.domContentLoadedEventEnd) + ' ms');
            addRow('Load Event End', Math.round(nav.loadEventEnd) + ' ms');
            addRow('Transfer Size', (nav.transferSize / 1024).toFixed(1) + ' KB');
        }

        // Environment Details
        addRow('Viewport', `${window.innerWidth} x ${window.innerHeight}`);
        addRow('Screen', `${window.screen.width} x ${window.screen.height}`);
        addRow('Device Memory', navigator.deviceMemory ? navigator.deviceMemory + ' GB' : 'Unknown');
        addRow('Hardware Concurrency', navigator.hardwareConcurrency ? navigator.hardwareConcurrency + ' Cores' : 'Unknown');
        addRow('Connection Status', navigator.onLine ? 'Online' : 'Offline');
        addRow('Connection Type', navigator.connection && navigator.connection.effectiveType ? navigator.connection.effectiveType : 'Unknown');

        pane.appendChild(table);
        contentDiv.appendChild(pane);
    }

})();

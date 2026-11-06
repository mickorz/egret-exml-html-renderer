// Canvas 宿主（P3-A P1）：iframe 加载 /view（&docid）+ 舞台尺寸设置 + 关系条（P2-C 邻域面板迁移）
// postMessage 双向选择（执行计划 3.2）：
//   iframe -> 父：CANVAS_READY / NODE_SELECTED / NODE_DESELECTED / NODE_NOT_FOUND（均携带 documentId）
//   父 -> iframe：SELECT_NODE / DESELECT_NODE（携带 documentId）
//   校验链：origin -> e.source（WindowProxy 同一文档导航期间保持，需 documentId 过滤过期文档）-> documentId
//   防环：仅转发 tree 来源的选择到画布；canvas 来源已在 iframe 本地高亮

export function canvasHostScript(): string {
  return `
// ---- Canvas 宿主（canvas-host） ----
(function () {
  var frame = document.getElementById("frame");
  var frameBox = document.getElementById("frame-box");
  var relBar = document.getElementById("rel-bar");
  var lastDocRef = null; // 守卫用 doc 对象身份：加载中（null）与加载完成（新对象）是不同状态，docId 在两者间不变
  var canvasReady = false; // iframe 文档就绪（CANVAS_READY 后才可发消息，否则消息丢在文档加载中）
  var ZOOM_STEP = 1.25;

  // 应用缩放（P3-A 铁律：只改外层视觉——frameBox 占位 = 舞台 x zoom；iframe transform 缩放；
  // 不改 Scene JSON/Renderer/bounds/选择协议；浏览器合成层缩放后点击自动命中）
  function applyZoom() {
    var st = (ED.doc && !ED.doc.error && ED.doc.stage) || {};
    var w = st.width || 640;
    var h = st.height || 480;
    frame.style.width = w + "px";
    frame.style.height = h + "px";
    frame.style.transformOrigin = "0 0";
    frame.style.transform = ED.zoom === 1 ? "" : "scale(" + ED.zoom + ")";
    frameBox.style.width = Math.round(w * ED.zoom) + "px";
    frameBox.style.height = Math.round(h * ED.zoom) + "px";
  }

  // topbar 缩放控件：步进 x1.25，clamp 由 edSetZoom 统一处理；Fit 在 P3-B 接通
  document.getElementById("tb-zoom-in").onclick = function () { edSetZoom(ED.zoom * ZOOM_STEP, false); };
  document.getElementById("tb-zoom-out").onclick = function () { edSetZoom(ED.zoom / ZOOM_STEP, false); };
  document.getElementById("tb-zoom-reset").onclick = function () { edSetZoom(1, false); };

  function postToCanvas(m) {
    if (canvasReady && frame.contentWindow) frame.contentWindow.postMessage(m, location.origin);
  }

  // 树侧选择 -> 画布高亮（仅 tree 来源；canvas 来源回发会成环）
  function sendSelection() {
    if (ED.source !== "tree") return;
    if (ED.sel) postToCanvas({ type: "SELECT_NODE", documentId: ED.docId, key: ED.sel });
    else postToCanvas({ type: "DESELECT_NODE", documentId: ED.docId });
  }

  // iframe -> 父：就绪/选中/取消/未找到（校验链 origin -> source -> documentId -> 字段类型）
  window.addEventListener("message", function (e) {
    if (e.origin !== location.origin) return;
    if (e.source !== frame.contentWindow) return;
    var m = e.data;
    if (!m || typeof m !== "object" || m.documentId !== ED.docId) return; // 过期文档消息丢弃
    if (m.type === "CANVAS_READY") {
      canvasReady = true;
      sendSelection(); // 树侧已选中而画布刚就绪：补发高亮
      return;
    }
    if (m.type === "NODE_SELECTED") {
      if (typeof m.key !== "string" || !m.key) return;
      edSelect(m.key, "canvas");
      return;
    }
    if (m.type === "NODE_DESELECTED") {
      edDeselect("canvas");
      return;
    }
    if (m.type === "NODE_NOT_FOUND") {
      // 树选中了画布未渲染的节点（如 List 动态项）：提示而不静默
      console.warn("[canvas-host] 画布未找到节点:", m.key);
      relBar.insertAdjacentHTML("afterbegin", '<div class="cycle">画布中未找到选中节点（可能未渲染或属于动态内容）: ' + esc(m.key) + '</div>');
      return;
    }
  });

  edSubscribe(function () {
    if (ED.doc !== lastDocRef) { // 新文档（含加载中）：画布需重载，就绪状态重置
      lastDocRef = ED.doc;
      canvasReady = false;
      if (!ED.file || !ED.doc || ED.doc.error) {
        relBar.style.display = "none";
        frame.src = "about:blank";
        frameBox.style.width = "0";
        frameBox.style.height = "0";
        return;
      }
      applyZoom();
      frame.src = "/view?file=" + encodeURIComponent(ED.file) + "&docid=" + encodeURIComponent(ED.docId);
      loadRel(ED.doc.className, ED.file);
      return;
    }
    // 同文档内：缩放变化（选择变化的 sendSelection 在下方）
    if (ED.doc && !ED.doc.error) applyZoom();
    // 同文档内选择变化：树来源 -> 转发画布高亮
    if (ED.doc && !ED.doc.error) sendSelection();
  });

  // ---- 关系条（P2-C loadNeighborhood 逻辑迁移） ----
  function esc(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function chipHtml(cls2, kind, jump) {
    return '<a class="chip" data-cls="' + esc(cls2) + '" data-kind="' + kind + '" data-jump="' + jump + '" href="#">' +
      esc(cls2) + ' <small>' + kind + "·" + jump + '</small></a>';
  }
  function loadRel(cls, fromFile) {
    if (!cls) {
      relBar.style.display = "block";
      relBar.innerHTML = '<span class="none">根元素无 class，无关系可查</span>';
      return;
    }
    relBar.style.display = "block";
    relBar.innerHTML = '<div class="title">组件关系：' + esc(cls) + ' 加载中...</div>';
    fetch("/api/component-graph?class=" + encodeURIComponent(cls)).then(function (r) { return r.json(); }).then(function (nb) {
      if (!ED.doc || ED.doc.className !== cls) return; // 过期响应丢弃
      var html = '<div class="title">组件关系：' + esc(cls) + (nb.node && nb.node.file ? ' <span class="none">(' + esc(nb.node.file) + ')</span>' : "") + '</div>';
      html += '<div class="group"><span class="label">引用了</span>' + (nb.uses.length ? nb.uses.map(function (e) { return chipHtml(e.to, e.kind, "定义"); }).join("") : '<span class="none">无</span>') + '</div>';
      html += '<div class="group"><span class="label">被引用</span>' + (nb.usedBy.length ? nb.usedBy.map(function (e) { return chipHtml(e.from, e.kind, "文件"); }).join("") : '<span class="none">无（孤儿皮肤或代码挂载）</span>') + '</div>';
      if (nb.inCycle) html += '<div class="cycle">警告：该类在图级引用环中 [' + nb.inCycle.map(esc).join(", ") + ']</div>';
      relBar.innerHTML = html;
    }).catch(function () {
      relBar.innerHTML = '<div class="title">组件关系：' + esc(cls) + ' <span class="none">加载失败</span></div>';
    });
  }

  // 芯片点击：引用类名 -> 定位定义文件并跳转（P2-C 逻辑迁移）
  relBar.addEventListener("click", function (e) {
    var a = e.target.closest("a[data-cls]");
    if (!a || a.dataset.jump !== "定义") return;
    e.preventDefault();
    var cls = a.dataset.cls;
    fetch("/api/ui-assets?class=" + encodeURIComponent(cls)).then(function (r) { return r.json(); }).then(function (res) {
      if (res.count > 0) { edOpenFile(res.entries[0].basic.file); }
      else { relBar.insertAdjacentHTML("afterbegin", '<div class="cycle">类 ' + esc(cls) + ' 无 EXML 定义文件（代码组件或悬空引用）</div>'); }
    });
  });
})();
`;
}

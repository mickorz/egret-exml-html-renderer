// Canvas 宿主（P3-A P0）：iframe 加载 /view + 舞台尺寸设置 + 关系条（P2-C 邻域面板迁移）
// P1 接入 postMessage 双向通信（SELECT_NODE/NODE_SELECTED 等，见执行计划 3.2）

export function canvasHostScript(): string {
  return `
// ---- Canvas 宿主（canvas-host） ----
(function () {
  var frame = document.getElementById("frame");
  var frameBox = document.getElementById("frame-box");
  var relBar = document.getElementById("rel-bar");
  var lastDocRef = null; // 守卫用 doc 对象身份：加载中（null）与加载完成（新对象）是不同状态，docId 在两者间不变

  edSubscribe(function () {
    if (ED.doc === lastDocRef) return; // 同文档内选择变化（P1 处理高亮）
    lastDocRef = ED.doc;
    if (!ED.file || !ED.doc) {
      relBar.style.display = "none";
      frame.src = "about:blank";
      frameBox.style.width = "0";
      frameBox.style.height = "0";
      return;
    }
    if (ED.doc.error) {
      relBar.style.display = "none";
      frame.src = "about:blank";
      frameBox.style.width = "0";
      frameBox.style.height = "0";
      return;
    }
    var st = ED.doc.stage || {};
    var w = st.width || 640;
    var h = st.height || 480;
    frame.style.width = w + "px";
    frame.style.height = h + "px";
    frameBox.style.width = w + "px";  // P3：缩放时 = 舞台尺寸 x zoom
    frameBox.style.height = h + "px";
    frame.src = "/view?file=" + encodeURIComponent(ED.file);
    loadRel(ED.doc.className, ED.file);
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

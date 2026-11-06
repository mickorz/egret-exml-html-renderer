// Scene Tree（P3-A P0）：/api/scene nodes 递归 + 根行（rootKey）-> 按需展开的节点树
// 标记徽章：展开（srcFile != 当前文件）/ 模拟（simulated）/ 合成（List:* 合成标签）
// 点击行为：P0 仅行选中样式 + 展开/折叠；P1 接入 setSelection 同步 Canvas

export function sceneTreeScript(): string {
  return `
// ---- Scene Tree（scene-tree） ----
(function () {
  var treeEl = document.getElementById("scene-tree");
  var infoEl = document.getElementById("st-info");
  var lastDocId = null;
  var selKey = null; // P0 本地行选中（P1 换 Selection Store 驱动）

  var ICON = { group: "G", container: "G", image: "I", label: "L", button: "B", rect: "R", scroller: "S", bitmapnumber: "N", animation: "A", skin: "K", custom: "X" };

  function esc(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function nodeRow(key, depth) {
    var entry = ED.index && ED.index.get(key);
    if (!entry) return null;
    var n = entry.node;
    var kids = n.children || [];
    var expanded = !!ED.stExpanded[key];
    var el = document.createElement("div");
    el.className = "row node" + (selKey === key ? " sel" : "");
    el.dataset.key = key;
    el.style.paddingLeft = (8 + depth * 14) + "px";
    var ident = n.name || n.id || "";
    var html = '<span class="caret">' + (kids.length ? (expanded ? "-" : "+") : "") + '</span>' +
      '<span class="icon">' + (ICON[n.type] || "·") + '</span>' +
      '<span class="lbl" title="' + esc(key) + '">' + esc(n.type) + (ident ? ' <span class="id">' + esc(ident) + '</span>' : '') + '</span>';
    if (n.srcFile && n.srcFile !== ED.file) html += '<span class="badge exp" title="' + esc(n.srcFile) + '">展开</span>';
    if (n.simulated) html += '<span class="badge sim">模拟</span>';
    if (n.native && n.native.tag && n.native.tag.indexOf("List:") === 0) html += '<span class="badge syn">合成</span>';
    el.innerHTML = html;
    el.onclick = function (e) {
      // 折叠箭头点击只切换展开；行点击选中（P1 接入 edSetSelection(key, "tree")）
      selKey = key;
      if (kids.length) ED.stExpanded[key] = !ED.stExpanded[key];
      render();
    };
    return el;
  }

  function render() {
    if (!ED.file) {
      treeEl.innerHTML = '<div class="empty">打开左侧 EXML 后展示节点结构</div>';
      infoEl.textContent = "";
      return;
    }
    if (!ED.doc) {
      treeEl.innerHTML = '<div class="empty">Scene JSON 加载中...</div>';
      infoEl.textContent = "";
      return;
    }
    if (ED.doc.error) {
      treeEl.innerHTML = '<div class="err">Scene JSON 加载失败: ' + esc(ED.doc.error) + '<br/><button onclick="edOpenFile(ED.file)">重试</button></div>';
      infoEl.textContent = "";
      return;
    }
    treeEl.innerHTML = "";
    var rootKey = ED.doc.rootKey;
    if (!rootKey) {
      // 理论不出现（toSceneJson 已补 rootKey）；防御性提示而非静默
      treeEl.innerHTML = '<div class="err">文档缺少 rootKey，无法构建树</div>';
      return;
    }
    function walk(key, depth) {
      var row = nodeRow(key, depth);
      if (!row) return;
      treeEl.appendChild(row);
      if (ED.stExpanded[key]) {
        var entry = ED.index.get(key);
        var kids = (entry.node.children || []);
        for (var i = 0; i < kids.length; i++) walk(kids[i].key, depth + 1);
      }
    }
    walk(rootKey, 0);
    infoEl.textContent = ED.index.size + " 节点";
  }

  // 默认展开：根 + 第一层（需求 4.2.4）
  function initExpansion() {
    var rootKey = ED.doc && ED.doc.rootKey;
    if (!rootKey || !ED.index) return;
    ED.stExpanded = {};
    ED.stExpanded[rootKey] = true;
    var entry = ED.index.get(rootKey);
    var kids = (entry && entry.node.children) || [];
    for (var i = 0; i < kids.length; i++) ED.stExpanded[kids[i].key] = true;
  }

  edSubscribe(function () {
    if (ED.docId !== lastDocId) {
      // 文档切换：重置选中 + 默认展开 + 重建树
      lastDocId = ED.docId;
      selKey = null;
      if (ED.doc && ED.doc.nodes) initExpansion();
      render();
      return;
    }
    render();
  });
})();
`;
}

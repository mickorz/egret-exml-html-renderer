// Selection Store 与文档加载（P3-A）：全局 ED 状态 + subscribe 通知 + /api/scene 拉取
// 零构建 vanilla：导出拼入页面的脚本字符串（与页面其他 editor 模块共享全局 ED）
//
// ED 数据流（P3-A 执行计划 2.3/3.1）：
//   openFile(file) -> 拉取 /api/scene（fetchSeq 防过期） -> 构建 key 索引 -> edNotify 分发
//   setSelection(key, source)（P1 接入） -> edNotify -> tree/canvas/inspector 各自响应

export function stateScript(): string {
  return `
// ---- Selection Store + 文档加载（editor-state） ----
(function () {
  window.ED = {
    file: null,            // 当前 EXML 相对路径
    doc: null,             // /api/scene 文档（{file,className,rootKey,stage,diagnostics,nodes} 或 {error}）
    docId: "",             // 当前文档标识（每次 openFile 递增；P1 postMessage 过期过滤）
    docSeq: 0,
    fetchSeq: 0,           // 请求序号：连续快速切换文件时只认最新
    sel: null,             // 当前选中 stableKey（P1 接入）
    source: null,          // 选择来源 "project"|"tree"|"canvas"（P1 防循环）
    ptExpanded: {},        // 工程树目录展开集合（路径 -> bool）
    stExpanded: {},        // Scene Tree 节点展开集合（key -> bool）
    index: null,           // Map<key, {node, parentKey, depth}>（Scene Tree 与 Inspector 共用）
    subs: []
  };

  window.edSubscribe = function (fn) { ED.subs.push(fn); };
  window.edNotify = function () {
    for (var i = 0; i < ED.subs.length; i++) {
      try { ED.subs[i](ED); } catch (e) { console.error("[editor-sub]", e); }
    }
  };

  // 统一选择入口（P1-A）：key 为 stableKey；source 区分来源（"tree"/"canvas"），防树与画布互相回发成环
  // 幂等：重复同 key 同来源不通知（避免点击已选行引发重渲染/闪烁）
  window.edSelect = function (key, source) {
    if (!key || (ED.sel === key && ED.source === source)) return;
    ED.sel = key;
    ED.source = source;
    edNotify();
  };
  window.edDeselect = function (source) {
    if (ED.sel === null) return;
    ED.sel = null;
    ED.source = source || null;
    edNotify();
  };

  window.edOpenFile = function (file) {
    if (ED.file === file && ED.doc && !ED.doc.error) return; // 重复点击不重载（防 iframe 闪烁）
    ED.file = file;
    var seq = ++ED.fetchSeq;
    ED.doc = null;
    ED.sel = null; ED.source = null;
    ED.docId = "d" + (++ED.docSeq);
    ED.stExpanded = {}; ED.index = null;
    edNotify(); // 通知加载中状态
    fetch("/api/scene?file=" + encodeURIComponent(file)).then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    }).then(function (doc) {
      if (seq !== ED.fetchSeq) return; // 过期响应丢弃（已切到其他文件）
      ED.doc = doc;
      edBuildIndex();
      edNotify();
    }).catch(function (err) {
      if (seq !== ED.fetchSeq) return;
      ED.doc = { error: String((err && err.message) || err) };
      edNotify();
    });
  };

  // key 索引：一次深度遍历构建（Scene Tree 渲染 / Inspector 查询 / 定位共用，不建两套数据）
  window.edBuildIndex = function () {
    var index = new Map();
    function walk(n, parentKey, depth) {
      index.set(n.key, { node: n, parentKey: parentKey, depth: depth });
      var kids = n.children || [];
      for (var i = 0; i < kids.length; i++) walk(kids[i], n.key, depth + 1);
    }
    var nodes = (ED.doc && ED.doc.nodes) || [];
    var rootKey = ED.doc && ED.doc.rootKey;
    for (var i = 0; i < nodes.length; i++) walk(nodes[i], rootKey, 1);
    if (rootKey) index.set(rootKey, { node: { type: "skin", key: rootKey, children: nodes }, parentKey: null, depth: 0 });
    ED.index = index;
  };
})();
`;
}

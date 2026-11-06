// Inspector（P3-A P0）：空状态骨架 + 状态订阅
// P0 仅空状态与选中占位；P2 阶段实现全量属性分组（Basic/Transform/Layout/Image/Text/Component/Advanced/Diagnostics）
// 数据铁律：只读 Scene JSON（ED.index），禁止从 DOM/CSS 反推 EXML 属性（执行计划 3.6）

export function inspectorScript(): string {
  return `
// ---- Inspector（inspector） ----
(function () {
  var el = document.getElementById("inspector");
  var EMPTY = '<div class="empty">请选择一个节点<br/><br/>在左侧 Scene Tree 或中间 Canvas<br/>点击一个节点查看它的属性。</div>';

  function esc(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  edSubscribe(function () {
    if (!ED.sel) { el.innerHTML = EMPTY; return; }
    // P0 占位：选中已发生但属性分组在 P2 实现
    el.innerHTML = '<div class="empty">已选中节点（属性面板见 P2 阶段）<br/><br/>' + esc(ED.sel) + '</div>';
  });

  el.innerHTML = EMPTY;
})();
`;
}

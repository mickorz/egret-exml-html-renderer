// EUI 布局静态应用（P1-C）：HorizontalLayout / VerticalLayout
// 语义（对齐 EUI）：
//   - 布局管理子节点位置：覆盖子节点显式 x/y（BasicLayout 才用显式坐标）
//   - gap：子节点间距；paddingLeft/Top/Right/Bottom：内容边距
//   - horizontalAlign / verticalAlign：内容总尺寸小于容器时的对齐（left/center/right、top/middle/bottom）
//   - 未测得尺寸的子节点保持原位（无法参与排列）
// TileLayout 不在本阶段（宿主节点 unsupported 明示）。

export interface LayoutChild {
  bounds: { x: number; y: number; width?: number; height?: number };
}

export interface EuiLayoutAttrs {
  gap: number;
  paddingLeft: number;
  paddingTop: number;
  paddingRight: number;
  paddingBottom: number;
  horizontalAlign: string;
  verticalAlign: string;
}

const num = (v: string | undefined): number | undefined => {
  if (v === undefined || v === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
};

/** 解析布局声明属性（缺省 gap=0 / padding=0 / 对齐 left+top） */
export function parseLayoutAttrs(attrs: Record<string, string>): EuiLayoutAttrs {
  return {
    gap: num(attrs.gap) ?? 0,
    paddingLeft: num(attrs.paddingLeft) ?? 0,
    paddingTop: num(attrs.paddingTop) ?? 0,
    paddingRight: num(attrs.paddingRight) ?? 0,
    paddingBottom: num(attrs.paddingBottom) ?? 0,
    horizontalAlign: attrs.horizontalAlign ?? "left",
    verticalAlign: attrs.verticalAlign ?? "top",
  };
}

/** 水平排列：x 顺次累计（宽+gap），y 按 verticalAlign；horizontalAlign 调整整行偏移 */
export function applyHorizontalLayout(children: LayoutChild[], box: { width?: number; height?: number }, la: EuiLayoutAttrs): void {
  const measurable = children.filter((c) => c.bounds.width !== undefined);
  const contentW = measurable.reduce((s, c) => s + (c.bounds.width ?? 0), 0) + la.gap * Math.max(0, measurable.length - 1);
  const freeX = box.width !== undefined ? Math.max(0, box.width - la.paddingLeft - la.paddingRight - contentW) : 0;
  const alignX = la.horizontalAlign === "center" ? freeX / 2 : la.horizontalAlign === "right" ? freeX : 0;
  let x = la.paddingLeft + alignX;
  for (const c of children) {
    const w = c.bounds.width;
    if (w === undefined) continue; // 不可测子节点保持原位
    c.bounds.x = x;
    layoutCrossAxisY(c, box, la);
    x += w + la.gap;
  }
}

/** 垂直排列：y 顺次累计（高+gap），x 按 horizontalAlign；verticalAlign 调整整列偏移 */
export function applyVerticalLayout(children: LayoutChild[], box: { width?: number; height?: number }, la: EuiLayoutAttrs): void {
  const measurable = children.filter((c) => c.bounds.height !== undefined);
  const contentH = measurable.reduce((s, c) => s + (c.bounds.height ?? 0), 0) + la.gap * Math.max(0, measurable.length - 1);
  const freeY = box.height !== undefined ? Math.max(0, box.height - la.paddingTop - la.paddingBottom - contentH) : 0;
  const alignY = la.verticalAlign === "middle" ? freeY / 2 : la.verticalAlign === "bottom" ? freeY : 0;
  let y = la.paddingTop + alignY;
  for (const c of children) {
    const h = c.bounds.height;
    if (h === undefined) continue;
    c.bounds.y = y;
    layoutCrossAxisX(c, box, la);
    y += h + la.gap;
  }
}

/** 水平布局的纵轴对齐（verticalAlign：top/middle/bottom；justify 未支持按 top） */
function layoutCrossAxisY(c: LayoutChild, box: { height?: number }, la: EuiLayoutAttrs): void {
  const h = c.bounds.height;
  if (h !== undefined && box.height !== undefined) {
    if (la.verticalAlign === "middle") {
      c.bounds.y = (box.height - h) / 2;
      return;
    }
    if (la.verticalAlign === "bottom") {
      c.bounds.y = box.height - la.paddingBottom - h;
      return;
    }
  }
  c.bounds.y = la.paddingTop;
}

/** 垂直布局的横轴对齐（horizontalAlign：left/center/right） */
function layoutCrossAxisX(c: LayoutChild, box: { width?: number }, la: EuiLayoutAttrs): void {
  const w = c.bounds.width;
  if (w !== undefined && box.width !== undefined) {
    if (la.horizontalAlign === "center") {
      c.bounds.x = (box.width - w) / 2;
      return;
    }
    if (la.horizontalAlign === "right") {
      c.bounds.x = box.width - la.paddingRight - w;
      return;
    }
  }
  c.bounds.x = la.paddingLeft;
}

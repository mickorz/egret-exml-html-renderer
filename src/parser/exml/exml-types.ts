// EXML 解析共享类型：XML 语法层解析结果，不承担渲染职责（P0-B）

/** EXML 节点定位诊断（解析器与场景构建共用） */
export interface ExmlDiagnostic {
  level: "warning" | "error";
  code: string;
  message: string;
  /** 关联节点的可读标识（tag 或 id），可为空 */
  nodeId?: string;
}

/** EXML 原始 XML 节点（保留 Namespace 与原始属性） */
export interface ExmlNode {
  /** 原始标签全名，如 "e:Image" */
  tag: string;
  /** Namespace 前缀，如 "e"；无前缀时为 "" */
  prefix: string;
  /** 去前缀的本地名，如 "Image" */
  localName: string;
  /** 原始属性（含 state 后缀属性与 xmlns 声明之外的属性，键为原始属性名） */
  attributes: Record<string, string>;
  children: ExmlNode[];
  /** 源文件内定位（P0 由解析器无法取得行列，保留字段） */
  sourceLocation?: {
    line?: number;
    column?: number;
  };
}

/** EXML 文档：一个 .exml 文件的语法解析结果 */
export interface ExmlDocument {
  /** 源文件绝对路径 */
  file: string;
  /** 根节点（正常为 e:Skin） */
  root: ExmlNode;
  /** namespace 前缀 -> URI（来自 xmlns 声明，含继承自文档的声明） */
  namespace: Record<string, string>;
  /** 解析诊断（非法结构、跳过的节点等） */
  diagnostics: ExmlDiagnostic[];
}

/** EUI namespace URI（组件识别依据，不做字符串前缀猜测） */
export const EUI_NS = "http://ns.egret.com/eui";
/** Wing IDE namespace URI（编辑器元数据，解析阶段直接跳过） */
export const WING_NS = "http://ns.egret.com/wing";
/** Egret 动画 namespace URI（tween 声明，P0 记录为 unsupported） */
export const TWEEN_NS = "http://ns.egret.com/tween";

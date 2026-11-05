import path from "node:path";
import { createInterface } from "node:readline";
import { toolGetExmlScene, toolGetNodeDetail, toolListExmlFiles, toolPreviewExml } from "./tools.js";

// egret-exml-html-renderer MCP server（P0-F）
// stdio 传输：换行分隔 JSON-RPC 2.0；实现 initialize / tools/list / tools/call
// 接入：.pi/mcp.json（env 传 EGRET_PROJECT_ROOT）

const root = process.env.EGRET_PROJECT_ROOT;
if (!root) {
  console.error("缺少环境变量 EGRET_PROJECT_ROOT（Egret 工程根目录，其下应有 resource/）");
  process.exit(1);
}
const ctx = { rootDir: path.resolve(root) };

const TOOLS = [
  {
    name: "list_exml_files",
    description: "列出 Egret 工程资源目录下全部 EXML 文件（相对路径）与工程信息",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "get_exml_scene",
    description: "获取 EXML 文件的 Scene JSON（节点树、bounds、属性、stableKey、未支持清单）；与 HTTP 服务返回同一份数据",
    inputSchema: {
      type: "object",
      properties: { file: { type: "string", description: "EXML 相对资源目录的路径（list_exml_files 返回的 file）" } },
      required: ["file"],
    },
  },
  {
    name: "preview_exml",
    description: "渲染 EXML 为独立 HTML 文件（file:// 资源引用），可选 Chrome headless 截图；返回预览地址与截图路径",
    inputSchema: {
      type: "object",
      properties: {
        file: { type: "string", description: "EXML 相对资源目录的路径" },
        screenshot: { type: "boolean", description: "是否附带 Chrome headless 截图（默认 false）" },
        width: { type: "number", description: "截图视口宽（默认舞台宽）" },
        height: { type: "number", description: "截图视口高（默认舞台高）" },
      },
      required: ["file"],
    },
  },
  {
    name: "get_node_detail",
    description: "按 stableKey 查询节点详情（类型/设计坐标/属性/资源解析结果/未支持项）",
    inputSchema: {
      type: "object",
      properties: {
        file: { type: "string", description: "EXML 相对资源目录的路径" },
        key: { type: "string", description: "get_exml_scene 返回的节点 stableKey" },
      },
      required: ["file", "key"],
    },
  },
];

interface RpcMessage {
  jsonrpc?: string;
  id?: number | string | null;
  method?: string;
  params?: { name?: string; arguments?: Record<string, unknown>; protocolVersion?: string };
}

function reply(id: RpcMessage["id"], result: unknown): void {
  process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id, result }) + "\n");
}

function replyError(id: RpcMessage["id"], code: number, message: string): void {
  process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id, error: { code, message } }) + "\n");
}

function callTool(name: string, args: Record<string, unknown>): unknown {
  switch (name) {
    case "list_exml_files":
      return toolListExmlFiles(ctx);
    case "get_exml_scene":
      return toolGetExmlScene(ctx, { file: String(args.file ?? "") });
    case "preview_exml":
      return toolPreviewExml(ctx, {
        file: String(args.file ?? ""),
        screenshot: args.screenshot === true,
        width: args.width !== undefined ? Number(args.width) : undefined,
        height: args.height !== undefined ? Number(args.height) : undefined,
      });
    case "get_node_detail":
      return toolGetNodeDetail(ctx, { file: String(args.file ?? ""), key: String(args.key ?? "") });
    default:
      throw new Error(`未知工具: ${name}`);
  }
}

function handle(msg: RpcMessage): void {
  const { id, method, params } = msg;
  if (!method) return;
  switch (method) {
    case "initialize":
      reply(id, {
        protocolVersion: params?.protocolVersion ?? "2024-11-05",
        capabilities: { tools: {} },
        serverInfo: { name: "egret-exml-html-renderer", version: "0.1.0" },
      });
      return;
    case "notifications/initialized":
      return; // 通知不回复
    case "tools/list":
      reply(id, { tools: TOOLS });
      return;
    case "tools/call": {
      const name = params?.name ?? "";
      try {
        const result = callTool(name, params?.arguments ?? {});
        reply(id, {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          structuredContent: result,
        });
      } catch (err) {
        reply(id, {
          content: [{ type: "text", text: String((err as Error)?.message ?? err) }],
          isError: true,
        });
      }
      return;
    }
    default:
      if (id !== undefined) replyError(id, -32601, `方法不存在: ${method}`);
  }
}

const rl = createInterface({ input: process.stdin });
rl.on("line", (line) => {
  if (!line.trim()) return;
  let msg: RpcMessage;
  try {
    msg = JSON.parse(line);
  } catch {
    return; // 非法行忽略
  }
  handle(msg);
});
rl.on("close", () => process.exit(0));

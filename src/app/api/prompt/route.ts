import { NextResponse, type NextRequest } from "next/server";
import {
  streamText,
  wrapLanguageModel,
  extractReasoningMiddleware,
  type JSONValue,
} from "ai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import modelList from "@/constants/models";
import { imageCreationPrompt } from "@/constants/prompt";

export const maxDuration = 60;

type ThinkingConfig = {
  model: string;
  presets: Presets;
  text: string;
  onMessage: (event: string, data: string, finished?: boolean) => void;
};

const BASE_URL =
  process.env.AI_PROVIDER_BASE_URL || "https://text.pollinations.ai/openai";
const API_KEY =
  process.env.AI_PROVIDER_API_KEY || process.env.POLLINATIONS_AI_API_KEY;
const DEFAULT_MODEL = process.env.AI_PROVIDER_DEFAULT_MODEL || "openai";

function generateMessage(text: string, params: Record<string, JSONValue> = {}) {
  return JSON.stringify({ text, ...params });
}

async function thinking({ model, presets, text, onMessage }: ThinkingConfig) {
  try {
    const openAICompatible = createOpenAICompatible({
      name: "openAICompatible",
      baseURL: BASE_URL,
      apiKey: API_KEY,
    });

    const generatePresetDesc = (presets: Presets) => {
      const descriptions: string[] = [];
      Object.entries(presets).forEach(([key, val]) => {
        if (val !== "") {
          if (key === "ar") {
            descriptions.push(`The aspect ratios is ${val}`);
          } else if (key === "style") {
            descriptions.push(`The style of the image is ${val}`);
          } else if (key === "color") {
            descriptions.push(`The overall color of the image is ${val}`);
          } else if (key === "light") {
            descriptions.push(`The lighting effect of the image is ${val}`);
          } else if (key === "composition") {
            descriptions.push(`The composition of the image is ${val}`);
          }
        }
      });
      return descriptions.join("\n");
    };

    const prompt = imageCreationPrompt
      .replace("{{number}}", "5")
      .replace("{{presets}}", generatePresetDesc(presets))
      .replace("{{ideas}}", text);

    // Optimization prompt
    const result = streamText({
      model:
        model === "deepseek-reasoning"
          ? wrapLanguageModel({
              model: openAICompatible(model),
              middleware: extractReasoningMiddleware({ tagName: "think" }),
            })
          : openAICompatible(model),
      prompt,
      onError: ({ error }) => {
        console.log(error);
      },
    });

    for await (const part of result.fullStream) {
      if (part.type === "text-delta") {
        onMessage("message", generateMessage(part.text, { finish: false }));
      } else if (part.type === "finish") {
        onMessage("message", generateMessage("", { finish: true }), true);
      } else if (part.type === "error") {
        console.error(part.error);
        onMessage(
          "error",
          generateMessage(
            part.error instanceof Error ? part.error.message : "Unknown error"
          )
        );
      }
    }
  } catch (err) {
    console.error("Optimization prompt: ", err);
    onMessage(
      "error",
      generateMessage("Content filter, please modify your text and retry.")
    );
  }
}

export async function POST(req: NextRequest) {
  const { presets = {}, text } = await req.json(); // 不读取前端传的model

  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const encoder = new TextEncoder();

  req.signal.onabort = () => {
    console.log("abort");
    writer.close();
  };

  // 强制使用配置文件中的模型
  const model = DEFAULT_MODEL;

  // 打印调试信息
  console.log("=== Prompt API 调试信息 ===");
  console.log("强制使用的 model:", model);
  console.log("BASE_URL:", BASE_URL);
  console.log("API_KEY:", API_KEY ? `${API_KEY.substring(0, 8)}...` : "未设置");
  console.log("========================");

  thinking({
    model: model, // 强制使用配置文件中的模型
    presets,
    text,
    onMessage: async (event, data, finished = false) => {
      await writer.write(encoder.encode(`event: ${event}\ndata: ${data}\n\n`));
      if ((event === "message" && finished) || event === "error") {
        await writer.close();
      }
    },
  });

  return new NextResponse(readable, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

import type { OpenCodeProviderConfig, ProviderCategory } from "../types";
import type { PresetTheme, TemplateValueConfig } from "./claudeProviderPresets";

export interface MiMoCodeProviderPreset {
  name: string;
  nameKey?: string;
  websiteUrl: string;
  apiKeyUrl?: string;
  settingsConfig: OpenCodeProviderConfig;
  isOfficial?: boolean;
  isPartner?: boolean;
  primePartner?: boolean;
  partnerPromotionKey?: string;
  category?: ProviderCategory;
  templateValues?: Record<string, TemplateValueConfig>;
  theme?: PresetTheme;
  icon?: string;
  iconColor?: string;
  isCustomTemplate?: boolean;
}

// Reuse OpenCode npm packages since MiMoCode uses the same format
export const mimocodeNpmPackages = [
  { value: "@ai-sdk/openai", label: "OpenAI Responses" },
  { value: "@ai-sdk/openai-compatible", label: "OpenAI Compatible" },
  { value: "@ai-sdk/anthropic", label: "Anthropic" },
  { value: "@ai-sdk/amazon-bedrock", label: "Amazon Bedrock" },
  { value: "@ai-sdk/google", label: "Google (Gemini)" },
] as const;

export const mimocodeProviderPresets: MiMoCodeProviderPreset[] = [
  {
    name: "Xiaomi MiMo",
    websiteUrl: "https://mimo.xiaomi.com",
    apiKeyUrl: "https://mimo.xiaomi.com",
    category: "cn_official",
    icon: "xiaomimimo",
    settingsConfig: {
      npm: "@ai-sdk/openai-compatible",
      options: {
        baseURL: "https://api.mimo.xiaomi.com/v1",
        apiKey: "",
      },
      models: {
        "mimo-v2.5-pro": {
          name: "MiMo v2.5 Pro",
        },
        "mimo-v2.5": {
          name: "MiMo v2.5",
        },
      },
    },
    templateValues: {
      apiKey: {
        label: "API Key",
        placeholder: "sk-...",
        editorValue: "",
      },
    },
  },
  {
    name: "OpenRouter",
    websiteUrl: "https://openrouter.ai",
    apiKeyUrl: "https://openrouter.ai/keys",
    category: "aggregator",
    icon: "openrouter",
    settingsConfig: {
      npm: "@ai-sdk/openai-compatible",
      options: {
        baseURL: "https://openrouter.ai/api/v1",
        apiKey: "",
      },
      models: {
        "anthropic/claude-sonnet-4": {
          name: "Claude Sonnet 4",
        },
        "google/gemini-2.5-pro-preview": {
          name: "Gemini 2.5 Pro",
        },
      },
    },
    templateValues: {
      apiKey: {
        label: "API Key",
        placeholder: "sk-or-...",
        editorValue: "",
      },
    },
  },
  {
    name: "DeepSeek",
    websiteUrl: "https://deepseek.com",
    apiKeyUrl: "https://platform.deepseek.com/api_keys",
    category: "cn_official",
    icon: "deepseek",
    settingsConfig: {
      npm: "@ai-sdk/openai-compatible",
      options: {
        baseURL: "https://api.deepseek.com/v1",
        apiKey: "",
      },
      models: {
        "deepseek-chat": {
          name: "DeepSeek V3",
        },
        "deepseek-reasoner": {
          name: "DeepSeek R1",
        },
      },
    },
    templateValues: {
      apiKey: {
        label: "API Key",
        placeholder: "sk-...",
        editorValue: "",
      },
    },
  },
];

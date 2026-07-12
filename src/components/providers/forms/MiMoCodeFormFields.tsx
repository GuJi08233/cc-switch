import type { OpenCodeModel, ProviderCategory } from "@/types";
import { OpenCodeFormFields } from "./OpenCodeFormFields";

interface MiMoCodeFormFieldsProps {
  npm: string;
  apiKey: string;
  baseUrl: string;
  headers: Record<string, string>;
  models: Record<string, OpenCodeModel>;
  extraOptions: Record<string, string>;
  category?: ProviderCategory;
  shouldShowApiKeyLink: boolean;
  websiteUrl: string;
  isPartner?: boolean;
  partnerPromotionKey?: string;
  onNpmChange: (npm: string) => void;
  onApiKeyChange: (apiKey: string) => void;
  onBaseUrlChange: (baseUrl: string) => void;
  onHeadersChange: (headers: Record<string, string>) => void;
  onModelsChange: (models: Record<string, OpenCodeModel>) => void;
  onExtraOptionsChange: (options: Record<string, string>) => void;
}

/**
 * MiMoCode form fields component
 *
 * MiMoCode uses the same provider config format as OpenCode (npm, options, models),
 * so this component delegates to OpenCodeFormFields with MiMoCode-specific translations.
 */
export function MiMoCodeFormFields(props: MiMoCodeFormFieldsProps) {
  return <OpenCodeFormFields {...props} />;
}

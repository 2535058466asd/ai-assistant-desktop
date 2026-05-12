import { OpenAICompatibleProvider } from './openAICompatibleProvider';

export class MiMoProvider extends OpenAICompatibleProvider {
  constructor(config: { baseUrl: string; apiKey: string }) {
    super({
      id: 'mimo',
      displayName: '小米 MiMo',
      baseUrl: config.baseUrl,
      apiKey: config.apiKey,
    });
  }
}

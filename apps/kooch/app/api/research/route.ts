import { createResearchApi, publicHamrahTool } from '../../../src/research/api';
export const maxDuration = 30;
export const POST = createResearchApi({ tool: publicHamrahTool }).POST;

import type { ModelExplanation, TutorRequest } from '../../shared/ai';
import { responsePolicy } from './responsePolicy';

export function mockTutor(request: TutorRequest): ModelExplanation {
  const policy=responsePolicy(request,1800);
  if(policy.currentIntent==='answer-only')return {explanation:'Demo content: mock mode cannot determine the answer from this screenshot.',annotations:[],warnings:['Mock mode: no image analysis.']};
  if (request.kind === 'chat') return {
    explanation: (request.annotation&&policy.style!=='detailed'
      ? 'Demo content: your followup is “'+request.question+'”. This box would answer that specific question about '+request.annotation.concept+'. No image analysis was performed.'
      : 'Demo content: this is a sample structured reply, not analysis of your screenshot.\n\n**Connect the reasoning**\n\n1. Identify what the original question asks.\n2. Explain how this step helps answer it.\n3. Check the result against the stated conditions.')
      + (request.lesson?.threads.length ? '\n\nShared lesson context supplied: ' + request.lesson.threads.map(t=>t.number ? 'box '+t.number : 'main chat').join(', ') + '.' : ''),
    annotations: [], warnings: ['Mock mode: the screenshot was not analyzed.'],
  };
  const area = request.image.selection;
  return {
    explanation: 'Demo content: these sample annotations demonstrate the study workflow. This mock provider does not understand the captured image.\n\n'
      + (policy.lessonIntent==='hint' ? '**Sample hint:** name one detail you want to understand.' : policy.lessonIntent==='solve'?'**Sample solution structure**\n\n1. State the result.\n2. Show the major operations that reach it.\n3. Check a likely mistake.':'**Sample explanation structure**\n\n1. Identify the crucial concept.\n2. Explain why it matters to the question.\n3. Connect it to the next step.'),
    annotations: (['arrow','underline'] as const).map((kind, index) => ({
      id: 'demo-' + kind, kind, concept: 'Demo ' + ['starting point', 'detail', 'connection', 'relationship', 'summary'][index],
      explanation: 'Demo content: click this sample annotation to open its separate followup conversation. No image analysis was performed.',
      target: { x: area.x + area.width * (0.05 + (index % 3) * 0.3), y: area.y + area.height * (index < 3 ? 0.15 : 0.6), width: area.width * 0.2, height: area.height * 0.3 },
    })),
    warnings: ['Mock mode: pointers are examples, not identified image content.'],
  };
}

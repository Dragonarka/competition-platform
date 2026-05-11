import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';

const { searchParamsMock, createMutationMock, createSimMutationMock, getCompetitionMock } =
  vi.hoisted(() => ({
    searchParamsMock: new Map<string, string>(),
    createMutationMock: vi.fn(),
    createSimMutationMock: vi.fn(),
    getCompetitionMock: vi.fn(),
  }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    back: vi.fn(),
  }),
  useSearchParams: () => ({
    get: (key: string) => searchParamsMock.get(key) ?? null,
  }),
}));

vi.mock('@/lib/trpc', () => ({
  trpc: {
    tournament: {
      create: { useMutation: createMutationMock },
      createSimulation: { useMutation: createSimMutationMock },
      getCompetition: { useQuery: getCompetitionMock },
    },
  },
}));

vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
}));

vi.mock('next-intl', () => ({
  useTranslations: (ns?: string) => (key: string, params?: Record<string, string>) => {
    if (params?.source && key === 'clonedNameDefault') return `${params.source} (Simulation)`;
    if (params?.source && key === 'cloneSourceHint')
      return `Configuration will be cloned from ${params.source}`;
    if (key === 'loadingSource') return 'Loading source competition…';
    if (ns === 'Competitions' && key === 'create') return 'Create Competition';
    if (ns === 'Competitions' && key === 'createSimulation') return 'Create Simulation';
    if (ns === 'Common' && key === 'cancel') return 'Cancel';
    return ns ? `${ns}.${key}` : key;
  },
}));

import { CreateCompetitionForm } from './create-competition-form';

interface RenderResult {
  container: HTMLElement;
  root: Root;
  unmount: () => void;
}

async function render(): Promise<RenderResult> {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(createElement(CreateCompetitionForm));
  });
  return {
    container,
    root,
    unmount: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

describe('CreateCompetitionForm', () => {
  beforeEach(() => {
    searchParamsMock.clear();
    createMutationMock.mockReset();
    createSimMutationMock.mockReset();
    getCompetitionMock.mockReset();
    createMutationMock.mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
      error: null,
    });
    createSimMutationMock.mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
      error: null,
    });
    getCompetitionMock.mockReturnValue({ data: undefined });
  });

  it('shows "Create Competition" button in normal mode', async () => {
    const { container, unmount } = await render();
    const submitBtn = container.querySelector('button[type="submit"]');
    expect(submitBtn?.textContent).toBe('Create Competition');
    unmount();
  });

  it('does NOT show mock participants field in normal mode', async () => {
    const { container, unmount } = await render();
    const mockField = container.querySelector('#mockParticipantCount');
    expect(mockField).toBeNull();
    unmount();
  });

  it('shows mock participants field when simulation=true', async () => {
    searchParamsMock.set('simulation', 'true');
    // No source param — renders form directly in simulation mode
    const { container, unmount } = await render();
    const mockField = container.querySelector('#mockParticipantCount');
    expect(mockField).not.toBeNull();
    unmount();
  });

  it('shows "Create Simulation" button in simulation mode', async () => {
    searchParamsMock.set('simulation', 'true');
    const { container, unmount } = await render();
    const submitBtn = container.querySelector('button[type="submit"]');
    expect(submitBtn?.textContent).toBe('Create Simulation');
    unmount();
  });

  it('calls createSimulation mutation in simulation mode on submit', async () => {
    searchParamsMock.set('simulation', 'true');
    const mutateFn = vi.fn();
    createSimMutationMock.mockReturnValue({
      mutate: mutateFn,
      isPending: false,
      error: null,
    });
    const { container, unmount } = await render();

    const nameInput = container.querySelector('#name') as HTMLInputElement;
    await act(async () => {
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value',
      )?.set;
      nativeInputValueSetter?.call(nameInput, 'Test Sim');
      nameInput.dispatchEvent(new Event('input', { bubbles: true }));
      nameInput.dispatchEvent(new Event('change', { bubbles: true }));
    });

    const form = container.querySelector('form')!;
    await act(async () => {
      form.dispatchEvent(new Event('submit', { bubbles: true }));
    });

    expect(mutateFn).toHaveBeenCalled();
    const callArg = mutateFn.mock.calls[0][0];
    expect(callArg.name).toBe('Test Sim');
    expect(callArg.mockParticipantCount).toBe(24);
    unmount();
  });

  it('shows loading state when source query is pending', async () => {
    searchParamsMock.set('simulation', 'true');
    searchParamsMock.set('source', 'src_comp');
    getCompetitionMock.mockReturnValue({ data: undefined });
    const { container, unmount } = await render();
    // No form rendered while source data loading
    expect(container.querySelector('form')).toBeNull();
    expect(container.textContent).toContain('Loading source competition');
    unmount();
  });

  it('pre-populates name from source competition', async () => {
    searchParamsMock.set('simulation', 'true');
    searchParamsMock.set('source', 'src_comp');
    getCompetitionMock.mockReturnValue({
      data: {
        id: 'src_comp',
        name: 'Summer Battle',
        isSimulation: false,
        status: 'draft',
        participantFormat: 'individual',
        cypherJudgeCount: null,
        cypherGroupCount: null,
        advancementThreshold: null,
        battlesJudgeCount: null,
        tieBreakingRule: null,
        cypherCompletedAt: null,
        soloMode: false,
      },
    });
    const { container, unmount } = await render();
    const nameInput = container.querySelector('#name') as HTMLInputElement;
    expect(nameInput?.value).toBe('Summer Battle (Simulation)');
    unmount();
  });
});

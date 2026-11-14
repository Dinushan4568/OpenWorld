import { el } from '../components/dom';
import type { JournalMissionView, JournalView } from '../../game/story/types';
import { Screen } from './Screen';

export interface QuestLogScreenCallbacks {
  onClose: () => void;
}

const STATUS_LABEL: Record<JournalMissionView['status'], string> = {
  active: 'In progress',
  complete: 'Complete',
  available: 'Available',
  locked: 'Locked',
};

/** The expedition journal: objectives, rewards, relics and recovered archive. */
export class QuestLogScreen extends Screen {
  private readonly callbacks: QuestLogScreenCallbacks;
  private readonly body: HTMLElement;
  private readonly titleEl: HTMLElement;
  private readonly subtitleEl: HTMLElement;
  private readonly summaryEl: HTMLElement;
  private readonly missionList: HTMLElement;
  private readonly endingEl: HTMLElement;

  constructor(callbacks: QuestLogScreenCallbacks) {
    super('overlay questlog');
    this.callbacks = callbacks;
    this.titleEl = el('h2', { class: 'questlog__title', text: '' });
    this.subtitleEl = el('p', { class: 'questlog__subtitle', text: '' });
    this.summaryEl = el('div', { class: 'questlog__summary' });
    this.missionList = el('div', { class: 'questlog__missions' });
    this.endingEl = el('div', { class: 'questlog__ending' });
    this.body = el('div', { class: 'questlog__body' });

    const card = el(
      'div',
      {
        class: 'questlog__card',
        attrs: { role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Mission journal' },
      },
      [
        el('div', { class: 'questlog__head' }, [
          el('div', {}, [
            el('div', { class: 'kicker', text: 'Field journal · Chapter One' }),
            this.titleEl,
            this.subtitleEl,
          ]),
          el('button', {
            class: 'dialogue__close',
            attrs: { type: 'button' },
            text: 'Close',
            on: { click: () => this.callbacks.onClose() },
          }),
        ]),
        this.summaryEl,
        this.body,
        el('div', { class: 'questlog__foot' }, [
          el('span', { text: 'Progress is written to this device as you play.' }),
          el('span', { class: 'questlog__glyph', attrs: { 'aria-hidden': 'true' }, text: '⌸' }),
        ]),
      ],
    );

    const backdrop = el('div', {
      class: 'overlay__backdrop',
      attrs: { 'aria-hidden': 'true' },
      on: { click: () => this.callbacks.onClose() },
    });
    this.root.append(backdrop, card);
    this.body.append(this.missionList, this.endingEl);
  }

  showLog(view: JournalView): void {
    this.render(view);
    this.show();
    this.root.classList.add('is-active');
    requestAnimationFrame(() => this.root.querySelector<HTMLElement>('.dialogue__close')?.focus({ preventScroll: true }));
  }

  refresh(view: JournalView): void {
    if (!this.isActive) return;
    this.render(view);
  }

  private render(view: JournalView): void {
    this.titleEl.textContent = view.chapterTitle;
    this.subtitleEl.textContent = view.chapterSubtitle;
    this.summaryEl.replaceChildren(
      this.stat('Main missions', `${view.mainComplete} / ${view.mainTotal}`),
      this.stat('Field work', `${view.sideComplete} / ${view.sideTotal}`),
      this.stat('Marks', String(view.marks)),
      this.stat('Echo shards', `${view.shards} / ${view.shardTotal}`),
    );

    const main = view.missions.filter((mission) => mission.kind === 'main');
    const side = view.missions.filter((mission) => mission.kind === 'side');
    const sections: HTMLElement[] = [];
    if (main.length > 0) sections.push(this.section('Main thread', main));
    if (side.length > 0) sections.push(this.section('Field work', side));
    sections.push(this.archive(view));
    this.missionList.replaceChildren(...sections);

    if (view.ending) {
      this.endingEl.replaceChildren(
        el('div', { class: 'questlog__ending-card' }, [
          el('div', { class: 'kicker', text: 'Chapter One · ending recorded' }),
          el('h3', { text: view.ending.title }),
          el('p', { class: 'questlog__ending-sub', text: view.ending.subtitle }),
          el('p', { text: view.ending.text }),
          el('p', { class: 'questlog__epitaph', text: view.ending.epitaph }),
        ]),
      );
    } else {
      this.endingEl.replaceChildren();
    }
  }

  private stat(label: string, value: string): HTMLElement {
    return el('div', { class: 'questlog__stat' }, [
      el('span', { text: label }),
      el('b', { text: value }),
    ]);
  }

  private section(title: string, missions: JournalMissionView[]): HTMLElement {
    return el('section', { class: 'questlog__section' }, [
      el('h3', { class: 'questlog__section-title', text: title }),
      ...missions.map((mission) => this.missionCard(mission)),
    ]);
  }

  private missionCard(mission: JournalMissionView): HTMLElement {
    const objectives =
      mission.status === 'locked'
        ? el('p', { class: 'questlog__locked', text: 'Continue the main thread to unlock this lead.' })
        : el(
            'ul',
            { class: 'questlog__objectives' },
            mission.objectives.map((objective) =>
              el(
                'li',
                {
                  class: `questlog__objective${objective.done ? ' is-done' : ''}${objective.current ? ' is-current' : ''}`,
                  attrs: { 'data-objective': objective.id },
                },
                [
                  el('span', { class: 'questlog__check', attrs: { 'aria-hidden': 'true' }, text: objective.done ? '✓' : objective.current ? '◈' : '·' }),
                  el('span', { class: 'questlog__objective-text', text: objective.text }),
                  objective.progress
                    ? el('span', { class: 'questlog__count', text: `${objective.progress.count} / ${objective.progress.required}` })
                    : null,
                ],
              ),
            ),
          );

    return el(
      'article',
      {
        class: `questlog__mission is-${mission.status}${mission.kind === 'side' ? ' is-side' : ''}`,
        attrs: { 'data-mission': mission.id },
      },
      [
        el('div', { class: 'questlog__mission-head' }, [
          el('div', {}, [
            el('span', { class: 'questlog__tag', text: mission.kind === 'main' ? 'Main mission' : 'Side mission' }),
            el('h4', { text: mission.title }),
            el('span', { class: 'questlog__giver', text: `Given by ${mission.giver}` }),
          ]),
          el('span', { class: `questlog__status is-${mission.status}`, text: STATUS_LABEL[mission.status] }),
        ]),
        el('p', { class: 'questlog__summary-text', text: mission.summary }),
        objectives,
        el('div', { class: 'questlog__reward' }, [
          el('span', { text: 'Reward' }),
          el('b', { text: mission.reward }),
        ]),
      ],
    );
  }

  private archive(view: JournalView): HTMLElement {
    const codex = view.codex.length
      ? el(
          'ul',
          { class: 'questlog__codex' },
          view.codex.map((entry) =>
            el('li', {}, [
              el('span', { class: 'questlog__codex-cat', text: entry.category }),
              el('span', { text: entry.title }),
            ]),
          ),
        )
      : el('p', { class: 'questlog__empty', text: 'No archive fragments recovered yet.' });
    const items = view.items.length
      ? el(
          'ul',
          { class: 'questlog__items' },
          view.items.map((item) => el('li', { text: item.label })),
        )
      : el('p', { class: 'questlog__empty', text: 'No expedition relics recovered yet.' });

    return el('section', { class: 'questlog__section questlog__archive' }, [
      el('div', { class: 'questlog__archive-col' }, [
        el('h3', { class: 'questlog__section-title', text: 'Relics carried' }),
        items,
      ]),
      el('div', { class: 'questlog__archive-col' }, [
        el('h3', { class: 'questlog__section-title', text: 'Echo archive' }),
        codex,
      ]),
    ]);
  }

  override hide(): void {
    this.root.classList.remove('is-active');
    super.hide();
  }
}

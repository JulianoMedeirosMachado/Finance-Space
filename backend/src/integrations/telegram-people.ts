import { BadRequestException } from '@nestjs/common';
import type { FinanceRecord } from '../finance/finance.schema';
import type { EntryProposal } from './integration.schema';

function normalizedWords(value: string): string[] {
  return (
    value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .match(/[\p{L}\p{N}]+/gu) || []
  );
}

export function mentionedPeople(references: FinanceRecord[], text: string) {
  const words = normalizedWords(text);
  const paddedText = ` ${words.join(' ')} `;
  const genericWords = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'the', 'of']);
  const matches: { id: string; kind: 'people'; name: string }[] = [];
  for (const person of references.filter(
    (record) => record.kind === 'people' && !record.data.isSelf,
  )) {
    const nameWords = normalizedWords(String(person.data.name));
    const full = nameWords.join(' ');
    let mention = '';
    if (full && paddedText.includes(` ${full} `)) {
      mention = full;
    } else {
      mention =
        nameWords
          .filter((word) => word.length >= 2 && !genericWords.has(word) && words.includes(word))
          .sort((a, b) => b.length - a.length)[0] || '';
    }
    if (mention) {
      matches.push({ id: person.id, kind: 'people', name: mention });
    }
  }
  return matches;
}

export function responsiblePersonId(
  proposal: EntryProposal,
  references: FinanceRecord[],
  text: string,
) {
  let personId: string | undefined;
  if (proposal.personId) {
    const candidates = mentionedPeople(references, text);
    const selected = candidates.find((person) => person.id === proposal.personId);
    if (selected && candidates.filter((person) => person.name === selected.name).length === 1) {
      personId = selected.id;
    } else {
      throw new BadRequestException(
        'Informe um responsável cadastrado sem ambiguidade e reenvie a mensagem completa.',
      );
    }
  } else if (proposal.personMentioned) {
    throw new BadRequestException(
      'Informe um responsável cadastrado sem ambiguidade e reenvie a mensagem completa.',
    );
  } else {
    personId = references.find((record) => record.kind === 'people' && record.data.isSelf)?.id;
  }
  return personId;
}

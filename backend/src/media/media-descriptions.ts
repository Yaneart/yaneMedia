const russianTextPattern = /[а-яё]/iu;

function selectRussianPreferred(values: Array<string | undefined>): string | undefined {
  const normalized = values.flatMap((value) => {
    const text = value?.trim();

    return text ? [text] : [];
  });

  return normalized.find((value) => russianTextPattern.test(value)) ?? normalized[0];
}

export function selectMediaDescription(
  description: string | undefined,
  shortDescription: string | undefined,
): string | undefined {
  return selectRussianPreferred([description, shortDescription]);
}

export function selectMediaShortDescription(
  shortDescription: string | undefined,
  description: string | undefined,
): string | undefined {
  return selectRussianPreferred([shortDescription, description]);
}

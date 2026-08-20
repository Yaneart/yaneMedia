export function focusFirstInvalidField(form: HTMLFormElement, fieldNames: readonly string[]): void {
  for (const fieldName of fieldNames) {
    const field = form.elements.namedItem(fieldName);

    if (field instanceof HTMLElement) {
      field.focus();
      return;
    }
  }
}

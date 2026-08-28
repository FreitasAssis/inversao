import '@testing-library/jest-dom/vitest'

/**
 * jsdom does not implement `<dialog>`, so `showModal` and `close` do not exist
 * and nothing here could open the settings.
 *
 * **What this stands in for, and what it does not.** It toggles the `open`
 * attribute and nothing else. The parts of a modal that are genuinely hard —
 * trapping focus inside it, closing on Escape, making the page behind it
 * inert, restoring focus to whatever opened it — are the browser's, and they
 * are the entire reason for using the native element instead of a div.
 *
 * So the tests around the settings cover what is ours: that the gear opens
 * them, that the controls are inside, that it is labelled, that it closes.
 * They do **not** cover the modal behaviour, and should not be read as if they
 * did.
 */
if (typeof HTMLDialogElement !== 'undefined' && !HTMLDialogElement.prototype.showModal) {
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.setAttribute('open', '')
  }
  HTMLDialogElement.prototype.show = function show(this: HTMLDialogElement) {
    this.setAttribute('open', '')
  }
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    this.removeAttribute('open')
    this.dispatchEvent(new Event('close'))
  }
}

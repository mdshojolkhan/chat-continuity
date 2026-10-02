# Fix V1 chat retention and mobile composer

## Changes
- Import the uploaded V1 project source without any Git metadata or generated dependencies.
- Keep a completed Build Generator prompt and result appended to the currently active conversation, then return to that same chat without clearing or replacing prior messages.
- Harden the mobile composer against the on-screen keyboard using the visual viewport, and keep the textarea scrolled to the active cursor while long text is entered or selected.
- Preserve all backend, provider, file, builder, and visual-design behavior.

## Verification
- Run the TypeScript checker and production build.
- Exercise the chat retention and long mobile composer behavior in the preview at a phone-sized viewport.

# V1 Personal AI Core

“I am uploading this ZIP from my existing replit-agent GitHub branch. Treat the uploaded project as the source of truth. Do not start from scratch and do not delete existing functionality.”You are working on my existing project called "V1 Agent".



IMPORTANT:

- This is my personal AI assistant project.

- Do NOT create a separate demo project.

- Do NOT delete or replace existing working features.

- First inspect the entire existing codebase and understand the current architecture.

- Preserve the existing UI and functionality unless an improvement is necessary.

- Work directly with the existing GitHub project/branch.

- Keep the code clean, modular, production-ready and easy to extend.



GOAL:

Transform the existing V1 Agent into the foundation of a real personal AI assistant.



Build the V1 Core architecture with these modules:



1. V1 Core / Orchestrator

   - Receive user messages.

   - Understand intent.

   - Decide whether to answer directly or use a tool.

   - Return structured responses.



2. Model Engine abstraction

   - Create a provider-independent ModelEngine interface.

   - Do NOT hard-code the whole application to one AI provider.

   - Make it possible to add cloud models, local models, or a future custom V1 model.



3. V1 API

   - Create a clean backend API for chat.

   - Add POST /api/chat.

   - Add proper request/response types.

   - Add validation and error handling.

   - Never expose API secrets to the frontend.



4. Memory architecture

   - Create short-term conversation memory.

   - Create persistent long-term memory architecture.

   - Keep memory modular so it can later use a database/local storage.



5. Tool/Skill architecture

   - Create a registry for V1 skills/tools.

   - Each tool must have a name, description, input schema and execution function.

   - Do not add dangerous device-control capabilities yet.

   - Make the system ready for future phone-control tools.



6. Security

   - Add environment-variable based secrets.

   - Add permission boundaries for tools.

   - Never allow arbitrary code execution from user messages.

   - Add basic request validation.



7. Existing UI

   - Keep the current V1 Agent UI.

   - Connect the chat UI to the new /api/chat backend.

   - Keep Attach and Voice UI elements compatible with future implementation.



8. Documentation

   - Update README/relevant documentation explaining the new architecture.

   - Clearly document how to configure the model provider.



Before making changes:

- Analyze the existing project.

- Identify what already exists and reuse it.

- Do not duplicate existing systems.



After implementation:

- Run the available tests/build/type checks.

- Fix errors.

- Ensure the application still starts successfully.



Do not implement Android phone control or self-modifying code yet.

This phase is ONLY the secure V1 Core foundation.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/8eddea5f-922b-430c-af3c-203c94b8f653).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```

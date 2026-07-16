# Privacy

Syna Live is local-first. Character profiles, conversation memory, uploaded
images, livestream configuration, and encrypted provider credentials stay on
the user's computer. The project does not include analytics or telemetry.

Messages and character instructions are sent only to the model provider chosen
by the user. Bilibili connectivity is optional and disabled by default.
Microphone audio is captured only after the user selects a voice-input mode.
When API ASR is selected, recorded audio is sent only to the ASR endpoint the
user configured. TTS text is likewise sent only to the configured TTS endpoint.

The diagnostics export contains feature status and version information only.
It excludes credentials, cookies, prompts, messages, local paths, usernames,
and uploaded files.

The dashboard intentionally displays the user's configured character profile,
conversation history, visual summary, provider/model names, endpoint URLs, and
livestream room number. These values remain local but may be visible in screen
recordings or screenshots. OBS stage tokens are masked in the dashboard and are
valid only against the loopback server running on the same computer.

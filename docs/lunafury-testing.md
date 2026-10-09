# LunaFury LUNA33 / TYPE33 protocol evidence

This integration is based on the public LunaFury WebHID configurator at
<https://mouse.lunafury.games/>. The site and its source map were inspected on
2026-10-05:

- `/js/app.14b76f96.js` and `/js/app.14b76f96.js.map` contain the device table
  and UI-side command calls.
- `/js/output.xvi3.min.js` contains the `XviUpdater` transport and the concrete
  feature-report packets.

The owner completed full-function testing on LUNA33 with firmware
`0.0.26.0`, over both cable and 8K receiver connections. This verifies the
LUNA33 runtime identities `0x0032` and `0x0033` on that firmware. TYPE33
identities and packet layouts are source-verified but have not been tested
on hardware.

On 2026-10-08 the owner also confirmed the next round on LUNA33, firmware
`0.0.26.0`, over both cable and 8K receiver: independent button polling,
DPI stage management including X/Y axes, and all three onboard profiles
worked normally. The owner subsequently confirmed mouse/scroll/DPI/media
remapping, keyboard single keys and combinations on the same model, firmware
and both connections. The owner further confirmed all four receiver light modes,
absence of lighting controls over cable, sleep/Never over both connections,
bank switching and reconnect readback. The redesigned official-style DPI UI
was confirmed on 2026-10-08 by the owner on LUNA33, firmware 0.0.26.0,
over both cable and 8K: stage selection, value editing, separate axes, stage
count changes and reconnect readback all worked. No separate Games or
power-cycle results were supplied.

## Bottom-button power / DPI behavior (2026-10-09, hardware unverified)

At the owner's request, the three added fixed actions (left double click,
browser refresh and open browser) were withdrawn. They are absent from the
official default menu. The previous verified DPI interface is retained.
No hardware binding is automatically restored or overwritten by this rollback;
existing removed assignments become unknown/read-only.

The current official `settingDialog.vue` exposes two bottom-button modes:
1. Short press: power on/off.
2. Long press: power on/off; short press: DPI.

`XviUpdater.getDpiPowerMode(profile)` reads target 2, page 3, command 0x80,
length 6, selector `[profile, 0x14]`. Its setter writes:
- Mode 1: length 5, `[profile, 0x14, 0, 0x15, 1]`.
- Mode 2: length 6, `[profile, 0x14, 0, 7, 1, 6]`.

The special five-byte power binding is not encoded as an ordinary button.
The read validates bank, selector, function and data rather than treating
every unknown function as mode 2 as the vendor UI does. Unsupported,
truncated and unfamiliar bindings stay hidden and cannot be overwritten.
Writes reread the existing binding, run through the onboard operation
queue, and confirm the exact selected mode. Ordinary buttons and other
banks are not written. Other brands cannot call this setter.

The card is on the Buttons page and uses staged Apply/undo. The setting
belongs to the current onboard bank but is deliberately excluded from
Games and profile imports so automatic game changes cannot alter power
button behavior. Changing the setting configures the binding; it does not
execute a power-off command. Both actual press behavior and persistence
after a power cycle are unverified; TYPE33 remains unverified.

Test on LUNA33 over cable and 8K with a backup pointing device available:
record each bank's original mode, compare with the official driver, apply
both modes, check physical short/long presses, reconnect/readback and bank
isolation, then restore the originals. Switching the mouse off may
disconnect it; turn it on again and reconnect before continuing.

## Official-style DPI editor (2026-10-08)

At the owner's request, the custom DPI color extension was withdrawn. The
LunaFury client no longer exposes a color setter or reads/writes the page-2
color table. Other brands' color support is unchanged. A regression test
checks that status reads and stage-count edits send no color-table commands.

The app uses the official driver's fixed index palette, active-stage X/Y
sliders, stage-value inputs and an explicit stage-count selector. Clicking a
tile or focusing an input selects that stage. Numeric inputs clamp to
50–30000 and round down in 50-DPI steps. The existing staged Apply workflow,
serialized bank operations and readback-confirmed writes are preserved.
Stage-count changes retain dormant device values as before.

Hardware retest: verify tile selection, value inputs, current-stage sliders,
linked/separate axes, count shrink/expansion, undo/Apply and reconnect in
each onboard bank over cable and 8K. Fixed color tiles are display markers,
not device color readback. No firmware/reset actions are included.

## Receiver lighting and Never auto-sleep (2026-10-08)

Re-inspection of the same vendor bundles found `SetLightEffect(1, mode)` and
`GetLightEffect(1)`. These address the receiver, not the active onboard bank:
target 0 for LUNA33 PID `0x0033`, target 1 for TYPE33 PID `0x0084`.
Page 2, command `0x80` reads six bytes with zone argument 1; command 0 writes
`[1, 0, mode, 0, 0, 0]`. Mode is payload byte 2: 2 = Mixed, 6 = Battery,
11 = DPI, 0 = Off. Wired identities never receive these commands. Unknown,
unsupported and truncated reads do not expose a control. Writes require a
supported pre-read and exact readback; stale zone replies are filtered.
This receiver-global setting is deliberately excluded from Games profiles.

Vendor `getSleepTime(profile)` reads page 0 command `0x87`; `setSleepTime`
writes command 7, three bytes `[profile, secondsHigh, secondsLow]`. The UI
offers 1–30 minutes, converting zero minutes to `0xffff` for Never. OpenMouse
represents Never as zero seconds and preserves custom normal timeouts; zero
wire values and other reserved values are not guessed. Only LunaFury uses this
conversion. Sleep edits share the onboard-operation queue with profile
switches and filter replies by profile before verifying the decoded timeout.

Hardware checklist: record the current receiver mode and each bank's timeout.
On the 8K receiver, apply Mixed/Battery/DPI/Off individually, inspect the LED,
and reconnect to verify readback. Cable connections must not show lighting.
For each connection, set a short sleep timeout, confirm actual idle sleep,
then choose Never and wait beyond that timeout without using the mouse.
Switch banks to check isolation, restore original values, and compare with
the vendor configurator (never run both configurators concurrently).

The owner has not supplied separate results for power-cycle persistence,
other firmware versions, or native-Bridge end-to-end testing. The stated
Corded/20 kHz behavior has not been independently measured.

## Runtime identities

All devices use the shared CompX VID `0x373e`.

| Model | Connection | PID | Polling rates exposed by LunaFury |
| --- | --- | --- | --- |
| LUNA33 | cable | `0x0032` | 125, 250, 500, 1000 Hz |
| LUNA33 | 8K receiver | `0x0033` | 125, 250, 500, 1000, 2000, 4000, 8000 Hz |
| TYPE33 | cable | `0x0054` | 125, 250, 500, 1000, 2000, 4000, 8000 Hz |
| TYPE33 | 8K receiver | `0x0084` | 125, 250, 500, 1000, 2000, 4000, 8000 Hz |

The configurator also lists `0xb032`, `0xb033`, `0xb054`, and `0xb084` as
bootloader PIDs. They are intentionally excluded: firmware-update identities
must not be claimed by the normal settings driver.

Both models advertise a 30,000 DPI ceiling. LUNA33 exposes up to six DPI
stages and TYPE33 up to five. The stage-read request carries that model limit,
so each product profile supplies the correct maximum while the reply still
determines the active stage list at runtime.

## Protocol match

The configurator sends report ID 0 with a 64-byte payload. That is the same
CompX/XVI envelope implemented by `src/compx/codec.ts` and
`src/drivers/lamzu/hid.ts`.

| Setting | Read | Write / encoding |
| --- | --- | --- |
| Firmware | page `0x00`, command `0x81` | read only |
| Battery | page `0x00`, command `0x83` | read only |
| Active profile | page `0x00`, command `0x85` | read only |
| Polling rate | page `0x01`, command `0x80` | command `0x00`; `08/04/02/01/20/40/80` = 125 through 8000 Hz |
| Sleep | page `0x00`, command `0x87` | command `0x07` |
| Debounce | page `0x00`, command `0x88` | command `0x08` |
| Lift-off distance | page `0x01`, command `0x88` | command `0x08`; `87/01/02` = low/medium/high |
| DPI stages | page `0x01`, command `0x81` | command `0x01` |
| Angle snap | page `0x01`, command `0x84` | command `0x04` |
| Motion sync | page `0x01`, command `0x89` | command `0x09` |
| Ripple control | page `0x01`, command `0x8a` | command `0x0a` |
| Competitive Mode / 竞技模式 | page `0x01`, command `0x8b` | command `0x0b`; vendor `setHyperMode`, shared field `hyperMode` |
| Tracking Mode / 追踪模式 | page `0x01`, command `0x93` | command `0x13`; vendor `setTrackingMode`, shared field `performanceMode` |
| Sensor angle | page `0x01`, command `0x94`, length 2 | command `0x14`; signed byte, −30° through +30° |
| Lightning Trigger | page `0x00`, command `0x98`, length 4 | command `0x18`; 0 = off, 1 = left priority, 2 = right priority |
| Per-button latency | page `0x00`, command `0x92`, length 19 | command `0x12`; button IDs 1/2/3 = left/right/middle |
| Wheel anti-mistouch | page `0x00`, command `0x99`, length 4 | command `0x19`; enable byte and big-endian window in milliseconds |

The cable transport rewrites mouse target `0x02` to target `0x00`. The 2.4 GHz
receiver keeps mouse commands on target `0x02`, while receiver firmware remains
on target `0x00`. These are represented by the product profiles rather than a
forked LunaFury protocol implementation.

### LunaFury-specific controls

LunaFury labels follow its official `language.js` and `patternModule.vue`:
`angleSnapping` is 直线修正, `hyperMode` is 竞技模式, and `performanceMode`
is 追踪模式. Motion Sync and Ripple Control use 运动同步 and 波纹控制 in
Chinese. These are display overrides for LunaFury only; commands and labels
for other brands remain unchanged.

The owner clarified the hardware semantics on 2026-10-05: Competitive Mode
is Corded mode and Tracking Mode locks sensor sampling at 20 kHz. This
description is owner-provided, not an independently measured result.
The UI mirrors the vendor's `v-if="competition"`: tracking is shown only
while competitive mode is confirmed on. Hiding it preserves its stored
value. For staged changes, competitive mode enables before tracking edits
and disables after them; other brands retain their existing ordering.

`XviUpdater.hidIndex` is 1: received WebHID buffers do not include the report
ID. Decoders use the payload after the six-byte CompX header. Lightning mode
and sensor angle are payload byte 1; button ID is byte 2 and button latency
is bytes 3–4; wheel enable is byte 1 and its window is bytes 2–3.

Left/right latency uses 0–15 ms in 1 ms steps; middle-button debounce uses
1–30 ms. The 19-byte latency write payload is
`[profile, 0, buttonId, hi, lo, 0, 0, hi, lo, 0, 0, 0, 20, 0, 0, 0, 20, 0, 0]`.
Wheel guard uses 20–200 ms in 20 ms steps. A disabled zero window is a valid
read, not a guessed default; enabling it from that state proposes 100 ms.
Writing a disabled zero window is supported so restoring a Games profile
does not invent a different prior value.

All added setters read back the value and reject a mismatch. Optional reads
that fail or return invalid values leave their controls absent, while basic
device settings remain available. Only the LunaFury product profiles issue
these extra commands; other CompX brands are unchanged.

LunaFury extension reads accept a reply only when its payload echoes the
requested profile; button-latency reads also match the button ID. A successful
reply for another profile or button is ignored while the same request waits
for a matching reply, within its existing attempt limit. This applies to both
initial reads and write readbacks. Generic CompX requests and write
acknowledgments retain their existing matching rules.

The UI places Lightning Trigger, independent left/right latency, middle
debounce, and wheel guard on the Buttons tab. Sensor angle is in Processing
on the Performance tab. As in the vendor UI, left/right priority disables
the corresponding latency slider. Turning priority off is applied before
staged latency edits, and enabling priority is applied after them. These
settings can also be saved in Games profiles as a partial LunaFury namespace.
Each profile restores only the controls it changed, preserving unrelated
settings and valid zero values.

## Required hardware check

### Onboard controls and button remapping

The public configurator's runtime controls use profile IDs 1–3. Button scan
rate is page 0, read `0x9f` / write `0x1f`, with codes 1/32/64/128 for
1000/2000/4000/8000 Hz. LUNA33 cable offers only 1000 Hz. DPI stages use
page 1, read `0x81` / write `0x01`, with a 26-byte table; active stage is
read `0x82` / write `0x02`. Separate axes use `0x8d` / `0x0d`. Active
profile uses page 0, read `0x85` / write `0x05`.

Button remapping uses page 3, read `0x80` / write `0x00`. The payload is
`[profile, button, 0, function, dataLength, ...data]`. Reads request
function `0xff`, data length 10 and envelope length 15. Physical IDs 1–5
are left, right, middle, back and forward. Mouse actions use function 1;
keyboard shortcuts use function 4 with `[modifierMask, HIDusage]`; media
actions use function 5 with a big-endian consumer usage; DPI actions use
function 7. Disabled is function 0 with no data. Receiver buttons,
bottom controls, macros and vendor-specific advanced actions are excluded
from ordinary remapping. Bottom-button behavior has its separate control
described above.

The owner confirmed ordinary remapping on LUNA33 firmware `0.0.26.0` over
both cable and the 8K receiver, as recorded above. TYPE33 remapping remains
source-derived and synthetically tested only. Left is protected. Macros and
unknown assignments remain read-only; no macro
storage or unrelated button is rewritten. Each write addresses the active
bank, reads the prior assignment, and checks the complete function/data
readback. Reads match both profile and physical button. Profile switching
and remapping share the serialized onboard-operation queue. Games profiles
capture and restore only the supported buttons they touched.

For hardware testing, record the current bank and assignments. Change right,
middle or a side button to a reversible mouse action first, then test scroll,
DPI, a single key, a shortcut and a media action. Check the actual output,
refresh/reconnect readback and bank isolation, then restore the originals.
Check that a macro configured in the official driver stays unchanged.
Games apply/restore needs a separate pass; a successful readback alone does
not prove that the bound key or action fires correctly.

Connect each available cable/receiver identity in Chromium and confirm:

1. OpenMouse labels it `LunaFury LUNA33` or `LunaFury TYPE33`, never Attack
   Shark.
2. Firmware, battery, DPI stages, polling, LOD, sleep, debounce, motion sync,
   angle snap, and ripple control read successfully.
3. Change one reversible setting at a time, read it back, then restore the
   original value.
4. Confirm only the rates in the table are offered for that connection.
5. Confirm the driver refuses bootloader/DFU identities. The shared broad
   VID filter may still let Chromium show them in its native picker; do not
   select or send settings commands to an upgrade-mode interface.
6. With Lightning Trigger off, test independent left/right latencies and
   middle debounce, refresh/reconnect, and compare their values with the
   vendor configurator. Test each priority mode separately, restoring the
   initial mode afterward.
7. Test sensor angles −1°, 0°, and +1° first. Confirm direction and persistence
   on hardware, then restore the original angle.
8. Test wheel guard off and on at 20/100/200 ms. Confirm the actual firmware
   behavior, then restore both the original enable state and window.
9. Save a Games profile with a single LunaFury control, apply it, and restore
   the prior settings. Confirm unrelated controls remain unchanged, including
   the originally disabled zero wheel window if reported by this firmware.
10. Confirm Competitive Mode controls Tracking Mode's visibility, including
    staged on/off changes, without silently resetting its stored value.

Automated coverage includes all four runtime IDs, cable/receiver targeting,
profile 3, full packet fixtures, signed angles, invalid ranges, unsupported
reads, ignored writes, and the other-brand guard. LUNA33 hardware testing
is recorded above; TYPE33 still needs a real-device pass. The owner's
full-function report does not include item-by-item results for this checklist.

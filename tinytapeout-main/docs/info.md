<!---

This file is used to generate your project datasheet. Please fill in the information below and delete any unused
sections.

You can also include images in this folder and reference them in the markdown. Each image must be less than
512 kb in size, and the combined size of all images must be less than 1 MB.
-->

## How it works

it takes a 4-bit number (0–9) on ui_in[3:0], looks it up in a case table, and turns on the matching 7-segment LEDs (a–g) on uo_out[6:0]

## How to test

How do I know it works? I  send 0–9 (and 10 for the off state) into ui_in[3:0] and check that uo_out[6:0] outputs the right 7-segment pattern for each number.




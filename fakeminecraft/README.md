# Stonefield

Stonefield is an original, small voxel sandbox for Windows. It uses C++20, Vulkan 1.3, GLFW, GLM, and Vulkan Memory Allocator. The terrain, colors, code, and name are original.

## Play

Open `dist/Stonefield/stonefield.exe` and select **Play World**. Keep the four `.spv` shaders and the `assets` folder beside the executable. A Vulkan 1.3 capable GPU and current driver are required.

| Control | Action |
| --- | --- |
| Mouse | Look |
| W A S D | Move |
| Space | Jump |
| Left mouse | Mine targeted block |
| Right mouse | Place selected block |
| 1–9 | Select a hotbar slot |
| [ and ] | Browse all block entries |
| E | Open or close inventory |
| Click inventory slot | Select that block |
| Prev / Next buttons or Page Up / Page Down | Browse inventory pages |
| F5 | Save world and inventory |
| Escape | Pause or return from a menu |

The title screen provides Play World, Controls, and Quit. The pause menu provides Resume, Save World, Controls, and Main Menu. Leaving through the menu saves automatically. Panels, buttons, and slots use original pixel textures; inventory and hotbar icons use the generated block art.

Every block entry starts with 64 units. Mined blocks return to inventory. Save files are created beside the executable.

## Build

Use Visual Studio 2026 with C++ desktop tools and CMake 3.25 or newer:

```powershell
cmake -S . -B build -G "Visual Studio 18 2026" -A x64
cmake --build build --config Release --target stonefield --parallel
```

CMake downloads open source dependencies during configuration. Debug builds require `VK_LAYER_KHRONOS_validation`; Release builds run without the layer. The renderer uses a swapchain, color/depth render pass, pipeline, push constant camera matrix, two synchronized frame slots, and VMA backed device buffers populated through staging copies.

## Current scope

The MVP generates and saves 16×384×16 chunks around the player, removes hidden faces, supports first person movement and collision, and mines/places blocks. The catalog combines Mojang's Bedrock v1.26.50.4 sample data with Microsoft's default block listing. All included block art is procedurally generated original work. Each cube face samples a 16×16 tile from the block atlas through a Vulkan descriptor set; grass has a separate side tile. Chunk meshes rebuild synchronously after edits, and mesh upload waits for the graphics queue; larger worlds may pause briefly. Greedy quad merging, specialized block shapes/behavior, crafting, mobs, and multiplayer are future work.

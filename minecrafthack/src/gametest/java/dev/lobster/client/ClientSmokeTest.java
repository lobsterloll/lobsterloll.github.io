package dev.lobster.client;

import com.mojang.blaze3d.platform.InputConstants;
import net.fabricmc.fabric.api.client.gametest.v1.FabricClientGameTest;
import net.fabricmc.fabric.api.client.gametest.v1.context.ClientGameTestContext;
import net.fabricmc.fabric.api.client.gametest.v1.context.TestSingleplayerContext;
import net.minecraft.client.gui.screens.TitleScreen;
import net.minecraft.core.BlockPos;
import net.minecraft.network.protocol.game.ServerboundMovePlayerPacket;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.animal.pig.Pig;
import net.minecraft.world.phys.Vec3;

public final class ClientSmokeTest implements FabricClientGameTest {
    @Override
    public void runTest(ClientGameTestContext context) {
        context.waitForScreen(TitleScreen.class);
        try (TestSingleplayerContext world = context.worldBuilder().create()) {
            world.getConnection().waitForChunksRender();
            world.getServer().runCommand("gamemode creative @a");
            world.getServer().runCommand("fill -12 99 -12 12 99 12 stone");
            world.getServer().runCommand("tp @a 0 100 0 0 0");
            world.getServer().runCommand("setblock 2 100 2 diamond_ore");
            world.getServer().runCommand("summon pig 0 100 2 {NoAI:1b,NoGravity:1b}");
            context.waitTicks(30);
            context.runOnClient(client -> {
                LobsterClient.disableAll();
                LobsterClient.toggle(Module.HUD);
                LobsterClient.toggle(Module.ESP);
                LobsterClient.toggle(Module.HITBOX);
                LobsterClient.toggle(Module.FULLBRIGHT);
                LobsterClient.toggle(Module.ORE_LOCATOR);
                boolean foundPig = false;
                for (Entity entity : client.level.entitiesForRendering()) {
                    if (entity instanceof Pig) {
                        foundPig = true;
                        if (!client.shouldEntityAppearGlowing(entity) || entity.getPickRadius() < 0.35F) {
                            throw new AssertionError("ESP/hitbox mixins did not activate");
                        }
                    }
                }
                if (!foundPig) {
                    throw new AssertionError("Test pig did not load");
                }
            });
            context.waitTicks(65);
            context.runOnClient(client -> {
                if (LobsterClient.ORES.nearest().stream().noneMatch(ore -> ore.position().equals(new BlockPos(2, 100, 2)))) {
                    throw new AssertionError("Ore locator did not find the test ore");
                }
                LobsterClient.toggle(Module.FREECAM);
            });
            Vec3 bodyBefore = context.computeOnClient(client -> client.player.position());
            context.getInput().holdKeyFor(options -> options.keyUp, 10);
            context.waitTicks(5);
            context.runOnClient(client -> {
                if (client.player.position().distanceTo(bodyBefore) > 0.1) {
                    throw new AssertionError("Freecam moved the player body");
                }
                if (LobsterClient.cameraPosition.distanceTo(bodyBefore) < 4) {
                    throw new AssertionError("Freecam input did not move the camera");
                }
                if (client.gameRenderer.mainCamera().position().distanceTo(LobsterClient.cameraPosition) > 0.1) {
                    throw new AssertionError("Freecam did not detach");
                }
                LobsterClient.toggle(Module.FREECAM);
            });
            context.getInput().pressKey(InputConstants.KEY_RSHIFT);
            context.waitForScreen(ToggleScreen.class);
            context.waitTicks(5);
            context.takeScreenshot("lobster-menu");
            context.clickScreenButton("Disable all");
            context.runOnClient(client -> {
                for (Module module : Module.values()) {
                    if (LobsterClient.enabled(module)) {
                        throw new AssertionError("Disable all left a module enabled");
                    }
                }
            });
            context.clickScreenButton("Done");
            context.runOnClient(client -> LobsterClient.toggle(Module.HUD));
            context.waitTicks(5);
            context.takeScreenshot("lobster-hud");

            world.getServer().runCommand("item replace entity @a weapon.mainhand with diamond_sword");
            context.waitTicks(5);
            context.runOnClient(client -> LobsterClient.toggle(Module.KILL_AURA));
            context.waitTicks(55);
            context.runOnClient(client -> {
                for (Entity entity : client.level.entitiesForRendering()) {
                    if (entity instanceof Pig && entity.isAlive()) {
                        throw new AssertionError("Kill Aura did not defeat the nearby pig");
                    }
                }
                LobsterClient.toggle(Module.KILL_AURA);
                LobsterClient.toggle(Module.VEINMINER);
            });
            world.getServer().runCommand("item replace entity @a weapon.mainhand with diamond_pickaxe");
            world.getServer().runCommand("setblock 0 101 2 diamond_ore");
            world.getServer().runCommand("setblock 1 101 2 diamond_ore");
            context.waitTicks(10);
            context.getInput().lookAt(new BlockPos(0, 101, 2));
            context.getInput().holdKeyFor(options -> options.keyAttack, 25);
            context.runOnClient(client -> {
                if (!client.level.getBlockState(new BlockPos(0, 101, 2)).isAir()
                    || !client.level.getBlockState(new BlockPos(1, 101, 2)).isAir()) {
                    throw new AssertionError("Veinminer did not break connected ore");
                }
                LobsterClient.toggle(Module.VEINMINER);
            });

            world.getServer().runCommand("gamemode survival @a");
            world.getServer().runCommand("tp @a 0 100 0 0 0");
            context.waitTicks(5);
            context.runOnClient(client -> {
                LobsterClient.toggle(Module.AUTO_SPRINT);
                LobsterClient.toggle(Module.SPEED);
            });
            Vec3 beforeSprint = context.computeOnClient(client -> client.player.position());
            context.getInput().holdKey(options -> options.keyUp);
            context.waitTicks(12);
            context.runOnClient(client -> {
                if (!client.player.isSprinting() || client.player.position().distanceTo(beforeSprint) < 3.5) {
                    throw new AssertionError("Auto Sprint / Faster Sprint did not accelerate movement");
                }
                LobsterClient.toggle(Module.AUTO_SPRINT);
                LobsterClient.toggle(Module.SPEED);
            });
            context.getInput().releaseKey(options -> options.keyUp);
            world.getServer().runCommand("fill -2 99 -2 2 99 2 water");
            world.getServer().runCommand("tp @a 0 100 0 0 0");
            context.runOnClient(client -> LobsterClient.toggle(Module.WATER_WALK));
            context.waitTicks(25);
            context.runOnClient(client -> {
                if (client.player.getY() < 99.8) {
                    throw new AssertionError("Water Walk did not keep the player on the surface");
                }
                LobsterClient.toggle(Module.WATER_WALK);
            });
            world.getServer().runCommand("fill -2 99 -2 2 99 2 stone");
            world.getServer().runCommand("tp @a 0 110 0 0 0");
            context.runOnClient(client -> LobsterClient.toggle(Module.NO_FALL));
            context.waitTicks(45);
            context.runOnClient(client -> {
                if (client.player.getHealth() < 20 || !client.player.onGround()) {
                    throw new AssertionError("No Fall failed the single-player landing test: health=" + client.player.getHealth());
                }
                LobsterClient.toggle(Module.NO_FALL);
                LobsterClient.toggle(Module.FLIGHT);
            });
            double beforeFlight = context.computeOnClient(client -> client.player.getY());
            context.getInput().holdKeyFor(options -> options.keyJump, 10);
            context.waitTicks(5);
            context.runOnClient(client -> {
                if (client.player.getY() < beforeFlight + 3) {
                    throw new AssertionError("Flight did not ascend");
                }
                LobsterClient.toggle(Module.FLIGHT);
                LobsterClient.toggle(Module.NO_FALL);
                client.player.fallDistance = 5;
                client.player.setDeltaMovement(0, -0.5, 0);
                if (!new ServerboundMovePlayerPacket.StatusOnly(false, false).isOnGround()) {
                    throw new AssertionError("No Fall did not mark the movement packet");
                }
                LobsterClient.disableAll();
                if (new ServerboundMovePlayerPacket.StatusOnly(false, false).isOnGround()) {
                    throw new AssertionError("No Fall remained active after disable all");
                }
            });
        }
    }
}

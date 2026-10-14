package dev.lobster.client;

import com.mojang.blaze3d.platform.InputConstants;
import dev.lobster.VeinminerServer;
import net.fabricmc.fabric.api.client.gametest.v1.FabricClientGameTest;
import net.fabricmc.fabric.api.client.gametest.v1.context.ClientGameTestContext;
import net.fabricmc.fabric.api.client.gametest.v1.context.TestSingleplayerContext;
import net.minecraft.client.gui.screens.TitleScreen;
import net.minecraft.core.BlockPos;
import net.minecraft.network.protocol.game.ServerboundMovePlayerPacket;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.animal.pig.Pig;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.phys.AABB;
import net.minecraft.world.phys.EntityHitResult;
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
            world.getServer().runCommand("setblock 25 100 0 emerald_ore");
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
                        if (!client.shouldEntityAppearGlowing(entity) || entity.getPickRadius() < LobsterClient.HITBOX_MARGIN) {
                            throw new AssertionError("ESP/hitbox mixins did not activate");
                        }
                    }
                }
                if (!foundPig) {
                    throw new AssertionError("Test pig did not load");
                }
            });
            context.waitTicks(5);
            context.takeScreenshot("lobster-hitbox");
            context.waitTicks(160);
            context.takeScreenshot("lobster-ore-locator");
            context.runOnClient(client -> {
                if (LobsterClient.ORES.nearest().stream().noneMatch(ore -> ore.position().equals(new BlockPos(2, 100, 2)))) {
                    throw new AssertionError("Ore locator did not find the test ore");
                }
                if (LobsterClient.ORES.nearest().stream().noneMatch(ore -> ore.position().equals(new BlockPos(25, 100, 0)))) {
                    throw new AssertionError("Ore locator did not find ore beyond the old 24-block radius");
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

            world.getServer().runCommand("gamemode survival @a");
            world.getServer().runCommand("tp @a 0 100 0 180 0");
            world.getServer().runCommand("item replace entity @a weapon.mainhand with diamond_sword");
            context.waitTicks(5);
            context.runOnClient(client -> {
                if (client.player.getLookAngle().z > -0.9) {
                    throw new AssertionError("Kill Aura test player was not facing away from the pig");
                }
                LobsterClient.toggle(Module.KILL_AURA);
            });
            context.waitTicks(30);
            context.runOnClient(client -> {
                for (Entity entity : client.level.entitiesForRendering()) {
                    if (entity instanceof Pig && entity.isAlive()) {
                        throw new AssertionError("Kill Aura did not defeat the nearby pig");
                    }
                }
                LobsterClient.toggle(Module.KILL_AURA);
                LobsterClient.toggle(Module.VEINMINER);
            });
            world.getServer().runCommand("summon pig -3 100 2 {NoAI:1b,NoGravity:1b}");
            world.getServer().runCommand("tp @a 0 100 0 0 0");
            context.waitTicks(5);
            context.runOnClient(client -> {
                if (client.player.raycastHitResult(1, client.player) instanceof EntityHitResult) {
                    throw new AssertionError("Off-axis pig was targetable before Hitbox Increase");
                }
                LobsterClient.toggle(Module.HITBOX);
            });
            context.waitTicks(5);
            world.getServer().runOnServer(server -> {
                if (!VeinminerServer.hitboxEnabled(server.getPlayerList().getPlayers().getFirst())) {
                    throw new AssertionError("Server did not receive Hitbox Increase state");
                }
            });
            context.runOnClient(client -> {
                var result = client.player.raycastHitResult(1, client.player);
                if (!(result instanceof EntityHitResult hit)
                    || !(hit.getEntity() instanceof Pig)) {
                    throw new AssertionError("Hitbox Increase did not expand weapon targeting");
                }
            });
            context.getInput().holdKeyFor(options -> options.keyAttack, 2);
            context.waitTicks(5);
            world.getServer().runOnServer(server -> {
                var pigs = server.overworld().getEntitiesOfClass(Pig.class, new AABB(-4, 99, 1, -2, 103, 3));
                if (pigs.isEmpty() || pigs.stream().allMatch(pig -> pig.getHealth() >= pig.getMaxHealth())) {
                    throw new AssertionError("Expanded hitbox did not deal real damage");
                }
            });
            world.getServer().runCommand("kill @e[type=minecraft:pig]");
            world.getServer().runCommand("summon pig 0 100 7 {NoAI:1b,NoGravity:1b}");
            context.waitTicks(15);
            world.getServer().runOnServer(server -> {
                var pig = server.overworld().getEntitiesOfClass(Pig.class, new AABB(-1, 99, 6, 2, 103, 9)).getFirst();
                var player = server.getPlayerList().getPlayers().getFirst();
                if (player.isWithinAttackRange(player.getMainHandItem(), pig.getBoundingBox(), 3)) {
                    throw new AssertionError("Distant pig was already in vanilla server attack range");
                }
            });
            context.runOnClient(client -> {
                if (!(client.player.raycastHitResult(1, client.player) instanceof EntityHitResult hit)
                    || !(hit.getEntity() instanceof Pig)) {
                    throw new AssertionError("Distant pig was not in the expanded hitbox");
                }
            });
            context.getInput().holdKeyFor(options -> options.keyAttack, 2);
            context.waitTicks(5);
            world.getServer().runOnServer(server -> {
                var pigs = server.overworld().getEntitiesOfClass(Pig.class, new AABB(-1, 99, 6, 2, 103, 9));
                if (pigs.isEmpty() || pigs.stream().allMatch(pig -> pig.getHealth() >= pig.getMaxHealth())) {
                    throw new AssertionError("Server rejected the expanded attack range");
                }
            });
            context.runOnClient(client -> LobsterClient.toggle(Module.HITBOX));
            world.getServer().runCommand("item replace entity @a weapon.mainhand with diamond_pickaxe");
            world.getServer().runCommand("gamemode survival @a");
            world.getServer().runCommand("tp @a 0.0 100.0 0.0 0 0");
            world.getServer().runCommand("setblock 2 100 2 air");
            world.getServer().runCommand("fill 0 100 2 1 101 3 diamond_ore");
            world.getServer().runCommand("setblock 2 102 3 diamond_ore");
            world.getServer().runCommand("setblock -1 102 1 diamond_ore");
            world.getServer().runCommand("fill 3 102 3 4 102 3 diamond_ore");
            world.getServer().runCommand("setblock 2 101 3 stone");
            context.waitTicks(10);
            if (!context.computeOnClient(client -> LobsterClient.serverVeinminer())) {
                throw new AssertionError("Packaged Veinminer server support was not available");
            }
            context.getInput().lookAt(new BlockPos(0, 101, 2));
            context.getInput().holdKeyFor(options -> options.keyAttack, 2);
            context.waitTicks(25);
            world.getServer().runOnServer(server -> {
                if (!server.overworld().getBlockState(new BlockPos(0, 101, 2)).is(Blocks.DIAMOND_ORE)) {
                    throw new AssertionError("Veinminer started automatically before the first ore broke");
                }
            });
            context.getInput().holdKey(options -> options.keyAttack);
            world.getServer().waitFor(server -> server.overworld().getBlockState(new BlockPos(0, 101, 2)).isAir(), 100);
            context.getInput().releaseKey(options -> options.keyAttack);
            context.waitTicks(5);
            world.getServer().runOnServer(server -> {
                for (BlockPos pos : BlockPos.betweenClosed(0, 100, 2, 1, 101, 3)) {
                    if (!server.overworld().getBlockState(pos).isAir()) {
                        throw new AssertionError("Veinminer left face-connected ore at " + pos);
                    }
                }
                for (BlockPos pos : new BlockPos[] {new BlockPos(2, 102, 3), new BlockPos(-1, 102, 1)}) {
                    if (!server.overworld().getBlockState(pos).isAir()) {
                        throw new AssertionError("Veinminer left diagonally connected ore at " + pos);
                    }
                }
                for (BlockPos pos : BlockPos.betweenClosed(3, 102, 3, 4, 102, 3)) {
                    if (!server.overworld().getBlockState(pos).isAir()) {
                        throw new AssertionError("Veinminer did not instantly break distant ore at " + pos);
                    }
                }
                if (!server.overworld().getBlockState(new BlockPos(2, 101, 3)).is(Blocks.STONE)) {
                    throw new AssertionError("Veinminer broke neighboring stone");
                }
                if (server.getPlayerList().getPlayers().getFirst().getMainHandItem().getDamageValue() < 12) {
                    throw new AssertionError("Veinminer did not apply normal pickaxe wear");
                }
            });
            context.runOnClient(client -> LobsterClient.toggle(Module.VEINMINER));

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
            world.getServer().runCommand("fill -8 99 -8 8 99 8 water");
            world.getServer().runCommand("tp @a 0 100 0 0 0");
            context.runOnClient(client -> LobsterClient.toggle(Module.WATER_WALK));
            context.waitTicks(25);
            context.getInput().holdKey(options -> options.keyUp);
            double lowestWaterY = Double.POSITIVE_INFINITY;
            double highestWaterY = Double.NEGATIVE_INFINITY;
            for (int tick = 0; tick < 30; tick++) {
                context.waitTicks(1);
                double waterY = context.computeOnClient(client -> client.player.getY());
                lowestWaterY = Math.min(lowestWaterY, waterY);
                highestWaterY = Math.max(highestWaterY, waterY);
            }
            context.getInput().releaseKey(options -> options.keyUp);
            if (highestWaterY - lowestWaterY > 0.04) {
                throw new AssertionError("Water Walk bobbed while moving: " + (highestWaterY - lowestWaterY));
            }
            double surfaceY = context.computeOnClient(client -> client.player.getY());
            context.getInput().holdKeyFor(options -> options.keyJump, 4);
            context.runOnClient(client -> {
                if (client.player.getY() < surfaceY + 0.3) {
                    throw new AssertionError("Water Walk did not jump from the surface");
                }
            });
            context.runOnClient(client -> {
                if (client.player.getY() < 99.8) {
                    throw new AssertionError("Water Walk did not keep the player on the surface");
                }
                LobsterClient.toggle(Module.WATER_WALK);
            });
            world.getServer().runCommand("fill -8 99 -8 8 99 8 stone");
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
                client.gui.setScreen(new ToggleScreen());
            });
            context.waitTicks(2);
            double menuHeight = context.computeOnClient(client -> client.player.getY());
            context.waitTicks(40);
            context.runOnClient(client -> {
                if (!(client.gui.screen() instanceof ToggleScreen)
                    || Math.abs(client.player.getY() - menuHeight) > 0.2) {
                    throw new AssertionError("Flight did not hover while the module menu was open");
                }
            });
            context.clickScreenButton("Done");
            context.getInput().holdKeyFor(options -> options.keyJump, 10);
            context.runOnClient(client -> {
                if (client.player.getY() < menuHeight + 3) {
                    throw new AssertionError("Flight did not resume after the module menu closed");
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

package dev.lobster.client;

import com.mojang.blaze3d.platform.InputConstants;
import java.io.IOException;
import java.nio.file.Path;
import net.fabricmc.api.ClientModInitializer;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientTickEvents;
import net.fabricmc.fabric.api.client.keymapping.v1.KeyMappingHelper;
import net.fabricmc.fabric.api.client.rendering.v1.hud.HudElementRegistry;
import net.fabricmc.fabric.api.client.rendering.v1.hud.VanillaHudElements;
import net.fabricmc.loader.api.FabricLoader;
import net.minecraft.client.DeltaTracker;
import net.minecraft.client.KeyMapping;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.multiplayer.ClientLevel;
import net.minecraft.core.BlockPos;
import net.minecraft.resources.Identifier;
import net.minecraft.tags.FluidTags;
import net.minecraft.util.Mth;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.Mob;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.phys.Vec3;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public final class LobsterClient implements ClientModInitializer {
    public static final ClientConfig CONFIG = new ClientConfig();
    public static final OreTools ORES = new OreTools();
    private static final Logger LOGGER = LoggerFactory.getLogger("lobster-client");
    private static final Path CONFIG_PATH = FabricLoader.getInstance().getConfigDir().resolve("lobster-client.properties");
    public static Vec3 cameraPosition;
    public static Vec3 previousCameraPosition;
    public static float cameraYaw;
    public static float cameraPitch;
    private static ClientLevel lastLevel;
    private KeyMapping menuKey;
    private KeyMapping freecamKey;
    private KeyMapping panicKey;

    @Override
    public void onInitializeClient() {
        try {
            CONFIG.load(CONFIG_PATH);
        } catch (IOException | IllegalArgumentException error) {
            LOGGER.warn("Could not read Lobster Client settings", error);
        }
        KeyMapping.Category category = KeyMapping.Category.register(Identifier.fromNamespaceAndPath("lobster_client", "controls"));
        menuKey = KeyMappingHelper.registerKeyMapping(new KeyMapping("key.lobster_client.menu", InputConstants.KEY_RSHIFT, category));
        freecamKey = KeyMappingHelper.registerKeyMapping(new KeyMapping("key.lobster_client.freecam", InputConstants.KEY_F6, category));
        panicKey = KeyMappingHelper.registerKeyMapping(new KeyMapping("key.lobster_client.panic", InputConstants.KEY_END, category));
        ClientTickEvents.END_CLIENT_TICK.register(this::tick);
        HudElementRegistry.attachElementBefore(VanillaHudElements.CHAT,
            Identifier.fromNamespaceAndPath("lobster_client", "hud"), LobsterClient::renderHud);
        LOGGER.info("Lobster Client initialized for Minecraft 26.3");
    }

    public static boolean enabled(Module module) {
        return CONFIG.enabled(module);
    }

    public static boolean freecam() {
        return enabled(Module.FREECAM) && cameraPosition != null;
    }

    public static boolean target(Entity entity) {
        Minecraft client = Minecraft.getInstance();
        return entity != client.player && entity.isAlive() && !entity.isSpectator()
            && (entity instanceof Mob || entity instanceof Player);
    }

    public static void toggle(Module module) {
        Minecraft client = Minecraft.getInstance();
        if (module == Module.FREECAM && !enabled(module)) {
            if (client.player == null || client.player.isPassenger() || !client.player.isAlive()) {
                return;
            }
            cameraPosition = client.player.getEyePosition();
            previousCameraPosition = cameraPosition;
            cameraYaw = client.player.getYRot();
            cameraPitch = client.player.getXRot();
            client.gameMode.stopDestroyBlock();
        }
        CONFIG.toggle(module);
        if (module == Module.FREECAM && !enabled(module)) {
            cameraPosition = null;
        }
        if (module == Module.VEINMINER && !enabled(module)) {
            ORES.stopMining(client);
        }
        save();
    }

    public static void disableAll() {
        CONFIG.disableAll();
        cameraPosition = null;
        ORES.stopMining(Minecraft.getInstance());
        ORES.reset();
        save();
    }

    private static void save() {
        try {
            CONFIG.save(CONFIG_PATH);
        } catch (IOException error) {
            LOGGER.warn("Could not save Lobster Client settings", error);
        }
    }

    private void tick(Minecraft client) {
        while (panicKey.consumeClick()) {
            disableAll();
        }
        while (menuKey.consumeClick()) {
            if (client.gui.screen() == null && client.player != null) {
                client.gui.setScreen(new ToggleScreen());
            }
        }
        while (freecamKey.consumeClick()) {
            if (client.gui.screen() == null) {
                toggle(Module.FREECAM);
            }
        }
        if (client.level != lastLevel || client.player == null || !client.player.isAlive()) {
            lastLevel = client.level;
            if (enabled(Module.FREECAM)) {
                toggle(Module.FREECAM);
            }
            ORES.reset();
        }
        if (client.player == null || client.level == null || client.isPaused()) {
            return;
        }
        if (enabled(Module.ORE_LOCATOR)) {
            ORES.scan(client);
        }
        if (freecam()) {
            previousCameraPosition = cameraPosition;
            if (client.gui.screen() == null) {
                double speed = client.options.keySprint.isDown() ? 1.5 : 0.6;
                cameraPosition = cameraPosition.add(movement(client, cameraYaw, speed, true));
            }
            return;
        }
        if (client.gui.screen() != null || client.gameMode.isSpectator()) {
            return;
        }
        if (enabled(Module.AUTO_SPRINT) && client.options.keyUp.isDown()
            && !client.player.isShiftKeyDown() && !client.player.horizontalCollision
            && !client.player.isUsingItem() && client.player.getFoodData().getFoodLevel() > 6) {
            client.player.setSprinting(true);
        }
        if (enabled(Module.FLIGHT) && !client.player.isPassenger()) {
            client.player.setDeltaMovement(movement(client, client.player.getYRot(), 0.65, true));
        } else {
            if (enabled(Module.SPEED) && client.player.isSprinting() && !client.player.isPassenger()) {
                Vec3 move = movement(client, client.player.getYRot(), 0.42, false);
                if (move.horizontalDistanceSqr() > 0) {
                    client.player.setDeltaMovement(move.x, client.player.getDeltaMovement().y, move.z);
                }
            }
            if (enabled(Module.WATER_WALK) && !client.options.keyShift.isDown() && !client.player.isPassenger()) {
                BlockPos below = BlockPos.containing(client.player.getX(), client.player.getY() - 0.1, client.player.getZ());
                var fluid = client.level.getFluidState(below);
                if (fluid.is(FluidTags.WATER)) {
                    double surface = below.getY() + fluid.getHeight(client.level, below);
                    double difference = surface - client.player.getY();
                    if (difference > -0.15 && difference < 0.5 && client.player.getDeltaMovement().y < 0.1) {
                        Vec3 velocity = client.player.getDeltaMovement();
                        client.player.setDeltaMovement(velocity.x, Math.max(0.08, difference), velocity.z);
                    }
                }
            }
        }
        if (enabled(Module.KILL_AURA) && !client.player.isUsingItem() && client.player.getAttackStrengthScale(0) >= 1) {
            LivingEntity closest = null;
            double distance = client.player.entityInteractionRange();
            double nearest = distance * distance;
            for (Entity entity : client.level.entitiesForRendering()) {
                if (!target(entity) || client.player.isAlliedTo(entity) || !client.player.hasLineOfSight(entity)) {
                    continue;
                }
                double candidate = entity.getBoundingBox().distanceToSqr(client.player.getEyePosition());
                if (candidate < nearest) {
                    closest = (LivingEntity) entity;
                    nearest = candidate;
                }
            }
            if (closest != null) {
                client.gameMode.attack(client.player, closest);
                client.player.swing(InteractionHand.MAIN_HAND, client.player.getMainHandItem().getAttackAnimation(), false);
            }
        }
    }

    private static Vec3 movement(Minecraft client, float yaw, double speed, boolean vertical) {
        double forward = (client.options.keyUp.isDown() ? 1 : 0) - (client.options.keyDown.isDown() ? 1 : 0);
        double side = (client.options.keyLeft.isDown() ? 1 : 0) - (client.options.keyRight.isDown() ? 1 : 0);
        double radians = Math.toRadians(yaw);
        Vec3 direction = new Vec3(side * Math.cos(radians) - forward * Math.sin(radians), 0,
            forward * Math.cos(radians) + side * Math.sin(radians));
        direction = direction.normalize().scale(speed);
        double up = vertical ? (client.options.keyJump.isDown() ? speed : 0) - (client.options.keyShift.isDown() ? speed : 0) : 0;
        return new Vec3(direction.x, up, direction.z);
    }

    public static void turnCamera(double yaw, double pitch) {
        cameraYaw += (float) yaw * 0.15F;
        cameraPitch = Mth.clamp(cameraPitch + (float) pitch * 0.15F, -90, 90);
    }

    private static void renderHud(GuiGraphicsExtractor graphics, DeltaTracker delta) {
        Minecraft client = Minecraft.getInstance();
        if (client.player == null || !enabled(Module.HUD)) {
            return;
        }
        int y = 8;
        graphics.fill(5, 5, 198, 34, 0xB018202A);
        graphics.text(client.font, "LOBSTER  /  Right Shift: menu", 10, y, 0xFFFF8A70);
        BlockPos pos = client.player.blockPosition();
        graphics.text(client.font, pos.getX() + " / " + pos.getY() + " / " + pos.getZ(), 10, y += 12, 0xFFD2DEE8);
        y += 18;
        for (Module module : Module.values()) {
            if (module != Module.HUD && enabled(module)) {
                graphics.text(client.font, module.label, 10, y, 0xFFA6E7CF);
                y += 11;
            }
        }
        if (enabled(Module.ORE_LOCATOR)) {
            y += 6;
            for (OreTools.Ore ore : ORES.nearest()) {
                if (!client.level.getBlockState(ore.position()).is(ore.block())) {
                    continue;
                }
                BlockPos block = ore.position();
                String name = ore.block().getName().getString();
                String label = name + ": " + block.getX() + ", " + block.getY() + ", " + block.getZ();
                graphics.text(client.font, label, 10, y, 0xFFFFD68A);
                y += 11;
                Vec3 center = Vec3.atCenterOf(block);
                Vec3 offset = center.subtract(client.gameRenderer.mainCamera().position());
                if (offset.dot(Vec3.directionFromRotation(client.gameRenderer.mainCamera().xRot(), client.gameRenderer.mainCamera().yRot())) <= 0) {
                    continue;
                }
                Vec3 projected = client.gameRenderer.projectPointToScreen(center);
                if (Math.abs(projected.x) < 0.95 && Math.abs(projected.y) < 0.9) {
                    int x = (int) ((projected.x + 1) * graphics.guiWidth() / 2);
                    int sy = (int) ((1 - projected.y) * graphics.guiHeight() / 2);
                    graphics.outline(x - 3, sy - 3, 7, 7, 0xFFFFD68A);
                    graphics.centeredText(client.font, name, x, sy + 7, 0xFFFFD68A);
                }
            }
        }
    }
}

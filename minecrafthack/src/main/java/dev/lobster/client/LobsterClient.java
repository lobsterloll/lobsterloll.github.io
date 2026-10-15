package dev.lobster.client;

import com.mojang.blaze3d.platform.InputConstants;
import dev.lobster.VeinminerServer;
import dev.lobster.VeinminerServer.TogglePayload;
import dev.lobster.VeinminerServer.HitboxTogglePayload;
import java.io.IOException;
import java.nio.file.Path;
import net.fabricmc.api.ClientModInitializer;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientTickEvents;
import net.fabricmc.fabric.api.client.networking.v1.ClientPlayConnectionEvents;
import net.fabricmc.fabric.api.client.networking.v1.ClientPlayNetworking;
import net.fabricmc.fabric.api.client.keymapping.v1.KeyMappingHelper;
import net.fabricmc.fabric.api.client.rendering.v1.level.LevelRenderContext;
import net.fabricmc.fabric.api.client.rendering.v1.level.LevelRenderEvents;
import net.fabricmc.fabric.api.client.rendering.v1.hud.HudElementRegistry;
import net.fabricmc.fabric.api.client.rendering.v1.hud.VanillaHudElements;
import net.fabricmc.loader.api.FabricLoader;
import net.minecraft.client.DeltaTracker;
import net.minecraft.client.KeyMapping;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.multiplayer.ClientLevel;
import net.minecraft.client.player.LocalPlayer;
import net.minecraft.core.BlockPos;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.gizmos.Gizmos;
import net.minecraft.gizmos.GizmoStyle;
import net.minecraft.network.protocol.game.ServerboundMovePlayerPacket;
import net.minecraft.network.protocol.game.ServerboundPlayerCommandPacket;
import net.minecraft.resources.Identifier;
import net.minecraft.tags.FluidTags;
import net.minecraft.util.Mth;
import net.minecraft.world.InteractionHand;
import net.minecraft.core.component.DataComponents;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.Mob;
import net.minecraft.world.entity.player.Inventory;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.inventory.ContainerInput;
import net.minecraft.world.level.block.entity.BarrelBlockEntity;
import net.minecraft.world.level.block.entity.ChestBlockEntity;
import net.minecraft.world.level.block.entity.EnderChestBlockEntity;
import net.minecraft.world.level.block.entity.ShulkerBoxBlockEntity;
import net.minecraft.world.level.chunk.status.ChunkStatus;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.item.enchantment.Enchantments;
import net.minecraft.world.phys.AABB;
import net.minecraft.world.phys.BlockHitResult;
import net.minecraft.world.phys.Vec3;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public final class LobsterClient implements ClientModInitializer {
    public static final float HITBOX_MARGIN = VeinminerServer.HITBOX_MARGIN;
    public static final ClientConfig CONFIG = new ClientConfig();
    public static final OreTools ORES = new OreTools();
    private static final Logger LOGGER = LoggerFactory.getLogger("lobster-client");
    private static final Path CONFIG_PATH = FabricLoader.getInstance().getConfigDir().resolve("lobster-client.properties");
    public static Vec3 cameraPosition;
    public static Vec3 previousCameraPosition;
    public static float cameraYaw;
    public static float cameraPitch;
    private static ClientLevel lastLevel;
    private static Entity pendingCriticalTarget;
    private static CriticalPhase criticalPhase = CriticalPhase.IDLE;
    private static InteractionHand autoEatHand;
    private static LocalPlayer autoEatPlayer;
    private static int autoEatPreviousSlot = -1;
    private static int autoEatFoodSlot = -1;
    private static int autoExpRepairingSlot = -1;
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
        ClientPlayConnectionEvents.JOIN.register((handler, sender, client) -> {
            syncVeinminer();
            syncHitbox();
        });
        HudElementRegistry.attachElementBefore(VanillaHudElements.CHAT,
            Identifier.fromNamespaceAndPath("lobster_client", "hud"), LobsterClient::renderHud);
        LevelRenderEvents.BEFORE_GIZMOS.register(LobsterClient::renderHighlights);
        LOGGER.info("Lobster Client initialized for Minecraft 26.3");
    }

    public static boolean enabled(Module module) {
        return CONFIG.enabled(module);
    }

    public static void selectTool(Minecraft client) {
        if (!enabled(Module.AUTO_TOOL) || client.player == null || client.level == null
            || client.player.isCreative() || !(client.hitResult instanceof BlockHitResult hit)) {
            return;
        }
        var state = client.level.getBlockState(hit.getBlockPos());
        var inventory = client.player.getInventory();
        int bestSlot = inventory.getSelectedSlot();
        var current = inventory.getItem(bestSlot);
        float bestSpeed = current.getDestroySpeed(state);
        boolean bestHarvest = current.isCorrectToolForDrops(state);
        for (int slot = 0; slot < Inventory.SELECTION_SIZE; slot++) {
            var tool = inventory.getItem(slot);
            float speed = tool.getDestroySpeed(state);
            boolean harvest = tool.isCorrectToolForDrops(state);
            if ((harvest && !bestHarvest) || (harvest == bestHarvest && speed > bestSpeed)) {
                bestSlot = slot;
                bestSpeed = speed;
                bestHarvest = harvest;
            }
        }
        inventory.setSelectedSlot(bestSlot);
    }

    public static boolean freecam() {
        return enabled(Module.FREECAM) && cameraPosition != null;
    }

    public static boolean serverVeinminer() {
        return Minecraft.getInstance().getConnection() != null && ClientPlayNetworking.canSend(TogglePayload.TYPE);
    }

    private static void syncVeinminer() {
        if (serverVeinminer()) {
            ClientPlayNetworking.send(new TogglePayload(enabled(Module.VEINMINER)));
        }
    }

    private static void syncHitbox() {
        if (Minecraft.getInstance().getConnection() != null && ClientPlayNetworking.canSend(HitboxTogglePayload.TYPE)) {
            ClientPlayNetworking.send(new HitboxTogglePayload(enabled(Module.HITBOX)));
        }
    }

    public static boolean target(Entity entity) {
        Minecraft client = Minecraft.getInstance();
        return entity != client.player && entity.isAlive() && !entity.isSpectator()
            && (entity instanceof Mob || entity instanceof Player);
    }

    public static boolean delayCriticalAttack(Player attacker, Entity target) {
        if (!enabled(Module.AUTO_CRIT) || !(target instanceof LivingEntity)
            || attacker != Minecraft.getInstance().player || attacker.isPassenger()
            || attacker.isInWater() || attacker.isInLava() || attacker.onClimbable()
            || attacker.isMobilityRestricted() || attacker.getAbilities().flying
            || enabled(Module.FLIGHT) || freecam()) {
            return false;
        }
        if (criticalPhase == CriticalPhase.ATTACK) {
            return false;
        }
        if (criticalPhase == CriticalPhase.RESET) {
            return true;
        }
        if (attacker.fallDistance > 0 && !attacker.onGround() && !attacker.isSprinting()
            && attacker.getAttackStrengthScale(0.5F) >= 0.99F) {
            return false;
        }
        pendingCriticalTarget = target;
        if (criticalPhase == CriticalPhase.IDLE) {
            criticalPhase = CriticalPhase.WAIT;
        }
        return true;
    }

    public static boolean sendCriticalPosition(LocalPlayer player) {
        if (criticalPhase == CriticalPhase.IDLE || criticalPhase == CriticalPhase.ATTACK) {
            return false;
        }
        if (criticalPhase == CriticalPhase.RESET) {
            player.connection.send(new ServerboundMovePlayerPacket.Pos(player.position(), player.onGround(), player.horizontalCollision));
            criticalPhase = CriticalPhase.IDLE;
            return true;
        }
        Entity target = pendingCriticalTarget;
        if (!enabled(Module.AUTO_CRIT) || target == null || !target.isAlive() || target.level() != player.level()
            || player.isPassenger() || player.isInWater() || player.isInLava() || player.onClimbable()
            || player.isMobilityRestricted() || player.getAbilities().flying
            || enabled(Module.FLIGHT) || freecam() || !player.hasLineOfSight(target)
            || !player.isWithinAttackRange(player.getMainHandItem(), target.getBoundingBox(),
                enabled(Module.HITBOX) ? HITBOX_MARGIN : 0)) {
            boolean wasSpoofing = criticalPhase != CriticalPhase.WAIT;
            criticalPhase = CriticalPhase.IDLE;
            pendingCriticalTarget = null;
            if (wasSpoofing) {
                player.connection.send(new ServerboundMovePlayerPacket.Pos(player.position(), player.onGround(), player.horizontalCollision));
            }
            return wasSpoofing;
        }
        if (criticalPhase == CriticalPhase.WAIT) {
            if (!player.onGround() || player.getAttackStrengthScale(0.5F) < 0.99F) {
                return false;
            }
            criticalPhase = CriticalPhase.UP;
        }
        if (criticalPhase == CriticalPhase.UP) {
            player.connection.send(new ServerboundMovePlayerPacket.Pos(
                player.getX(), player.getY() + 0.0625, player.getZ(), false, player.horizontalCollision));
            criticalPhase = CriticalPhase.DOWN;
            return true;
        }
        player.connection.send(new ServerboundMovePlayerPacket.Pos(player.position(), false, player.horizontalCollision));
        criticalPhase = CriticalPhase.ATTACK;
        player.connection.send(new ServerboundPlayerCommandPacket(player, ServerboundPlayerCommandPacket.Action.STOP_SPRINTING));
        Minecraft client = Minecraft.getInstance();
        client.gameMode.attack(player, target);
        player.swing(InteractionHand.MAIN_HAND, player.getMainHandItem().getAttackAnimation(), false);
        if (player.isSprinting()) {
            player.connection.send(new ServerboundPlayerCommandPacket(player, ServerboundPlayerCommandPacket.Action.START_SPRINTING));
        }
        pendingCriticalTarget = null;
        criticalPhase = CriticalPhase.RESET;
        return true;
    }

    private static void cancelCriticalAttack() {
        criticalPhase = criticalPhase == CriticalPhase.IDLE || criticalPhase == CriticalPhase.WAIT
            ? CriticalPhase.IDLE : CriticalPhase.RESET;
        pendingCriticalTarget = null;
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
        if (module == Module.VEINMINER) {
            if (!enabled(module)) {
                ORES.stopMining(client);
            }
            syncVeinminer();
        }
        if (module == Module.HITBOX) {
            syncHitbox();
        }
        if (module == Module.AUTO_CRIT && !enabled(module)) {
            cancelCriticalAttack();
        }
        if (module == Module.AUTO_EAT && !enabled(module)) {
            stopAutoEat(client);
        }
        if (module == Module.AUTO_EXP && !enabled(module)) {
            autoExpRepairingSlot = -1;
        }
        save();
    }

    public static void disableAll() {
        CONFIG.disableAll();
        cancelCriticalAttack();
        stopAutoEat(Minecraft.getInstance());
        autoExpRepairingSlot = -1;
        cameraPosition = null;
        ORES.stopMining(Minecraft.getInstance());
        ORES.reset();
        syncVeinminer();
        syncHitbox();
        save();
    }

    static void save() {
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
            stopAutoEat(client);
            autoExpRepairingSlot = -1;
            lastLevel = client.level;
            criticalPhase = CriticalPhase.IDLE;
            pendingCriticalTarget = null;
            if (enabled(Module.FREECAM)) {
                toggle(Module.FREECAM);
            }
            ORES.reset();
        }
        if (client.player == null || client.level == null || client.isPaused()) {
            stopAutoEat(client);
            return;
        }
        if (enabled(Module.ORE_LOCATOR)) {
            ORES.scan(client);
        }
        if (freecam()) {
            stopAutoEat(client);
            previousCameraPosition = cameraPosition;
            if (client.gui.screen() == null) {
                double speed = client.options.keySprint.isDown() ? 1.5 : 0.6;
                cameraPosition = cameraPosition.add(movement(client, cameraYaw, speed, true));
            }
            return;
        }
        if (client.gui.screen() != null || client.gameMode.isSpectator()) {
            stopAutoEat(client);
            if (client.gui.screen() instanceof ToggleScreen && enabled(Module.FLIGHT)
                && !client.player.isPassenger() && !client.gameMode.isSpectator()) {
                client.player.setDeltaMovement(Vec3.ZERO);
            }
            return;
        }
        tickAutoEat(client);
        tickAutoExp(client);
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
                        double lift = client.options.keyJump.isDown() ? 0.42 : Math.max(0, difference);
                        client.player.setDeltaMovement(velocity.x, lift, velocity.z);
                    }
                }
            }
        }
        if (enabled(Module.KILL_AURA) && !client.player.isUsingItem()
            && (!CONFIG.autoEatPauseAuras || autoEatHand == null)
            && client.player.getAttackStrengthScale(0) >= 0.85F) {
            LivingEntity closest = null;
            double nearest = Double.POSITIVE_INFINITY;
            for (Entity entity : client.level.entitiesForRendering()) {
                if (!target(entity) || client.player.isAlliedTo(entity) || !client.player.hasLineOfSight(entity)
                    || !client.player.isWithinAttackRange(client.player.getMainHandItem(), entity.getBoundingBox(), 0)) {
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
                if (criticalPhase == CriticalPhase.IDLE) {
                    client.player.swing(InteractionHand.MAIN_HAND, client.player.getMainHandItem().getAttackAnimation(), false);
                }
            }
        }
    }

    private static void tickAutoEat(Minecraft client) {
        LocalPlayer player = client.player;
        if (!enabled(Module.AUTO_EAT) || player.isCreative() || (autoEatHand != null && player != autoEatPlayer)
            || (autoEatFoodSlot >= 0 && player.getInventory().getSelectedSlot() != autoEatFoodSlot)) {
            stopAutoEat(client);
            return;
        }
        boolean lowHealth = player.getHealth() <= CONFIG.autoEatHealth;
        boolean lowHunger = player.getFoodData().getFoodLevel() <= CONFIG.autoEatHunger;
        boolean shouldEat = switch (CONFIG.autoEatThreshold) {
            case HEALTH -> lowHealth;
            case HUNGER -> lowHunger;
            case ANY -> lowHealth || lowHunger;
            case BOTH -> lowHealth && lowHunger;
        };
        if (!shouldEat) {
            stopAutoEat(client);
            return;
        }
        if (autoEatHand != null && player.isUsingItem() && player.getUsedItemHand() == autoEatHand) {
            client.options.keyUse.setDown(true);
            return;
        }
        if (autoEatHand == null && (player.isHandsBusy() || client.options.keyUse.isDown())) {
            return;
        }
        int foodSlot = findAutoEatFood(player);
        if (foodSlot < 0) {
            stopAutoEat(client);
            return;
        }
        if (foodSlot >= Inventory.SELECTION_SIZE && foodSlot != Inventory.SLOT_OFFHAND) {
            int emptySlot = -1;
            for (int slot = 0; slot < Inventory.SELECTION_SIZE; slot++) {
                if (player.getInventory().getItem(slot).isEmpty()) {
                    emptySlot = slot;
                    break;
                }
            }
            if (emptySlot < 0) {
                stopAutoEat(client);
                return;
            }
            client.gameMode.handleContainerInput(player.containerMenu.containerId, foodSlot, emptySlot,
                ContainerInput.SWAP, player);
            foodSlot = emptySlot;
        }
        if (autoEatHand == null) {
            autoEatPreviousSlot = player.getInventory().getSelectedSlot();
            autoEatPlayer = player;
        }
        InteractionHand hand = foodSlot == Inventory.SLOT_OFFHAND ? InteractionHand.OFF_HAND : InteractionHand.MAIN_HAND;
        autoEatHand = hand;
        if (hand == InteractionHand.MAIN_HAND) {
            autoEatFoodSlot = foodSlot;
            player.getInventory().setSelectedSlot(foodSlot);
        }
        client.gameMode.useItem(player, hand);
        if (player.isUsingItem()) {
            client.options.keyUse.setDown(true);
        } else {
            stopAutoEat(client);
        }
    }

    private static void tickAutoExp(Minecraft client) {
        LocalPlayer player = client.player;
        if (!enabled(Module.AUTO_EXP) || player.isCreative() || player.isUsingItem()
            || client.options.keyUse.isDown() || autoEatHand != null
            || (CONFIG.autoExpOnlyGround && !player.onGround())) {
            return;
        }
        Inventory inventory = player.getInventory();
        if (autoExpRepairingSlot < 0) {
            if (CONFIG.autoExpMode != ClientConfig.ExpMode.HANDS) {
                for (int slot = 36; slot < 40; slot++) {
                    if (needsExpRepair(inventory.getItem(slot), CONFIG.autoExpMinThreshold)) {
                        autoExpRepairingSlot = slot;
                        break;
                    }
                }
            }
            if (autoExpRepairingSlot < 0 && CONFIG.autoExpMode != ClientConfig.ExpMode.ARMOR) {
                int selected = inventory.getSelectedSlot();
                if (needsExpRepair(inventory.getItem(selected), CONFIG.autoExpMinThreshold)) {
                    autoExpRepairingSlot = selected;
                } else if (needsExpRepair(inventory.getItem(Inventory.SLOT_OFFHAND), CONFIG.autoExpMinThreshold)) {
                    autoExpRepairingSlot = Inventory.SLOT_OFFHAND;
                }
            }
        }
        if (autoExpRepairingSlot < 0) {
            return;
        }
        if (!needsExpRepair(inventory.getItem(autoExpRepairingSlot), CONFIG.autoExpMaxThreshold)) {
            autoExpRepairingSlot = -1;
            return;
        }
        int bottleSlot = -1;
        for (int slot = 0; slot < Inventory.SELECTION_SIZE; slot++) {
            if (inventory.getItem(slot).is(Items.EXPERIENCE_BOTTLE)) {
                bottleSlot = slot;
                break;
            }
        }
        if (bottleSlot < 0 && inventory.getItem(Inventory.SLOT_OFFHAND).is(Items.EXPERIENCE_BOTTLE)) {
            bottleSlot = Inventory.SLOT_OFFHAND;
        }
        if (bottleSlot < 0 && CONFIG.autoExpReplenish) {
            for (int slot = Inventory.SELECTION_SIZE; slot < 36; slot++) {
                if (inventory.getItem(slot).is(Items.EXPERIENCE_BOTTLE)) {
                    client.gameMode.handleContainerInput(player.containerMenu.containerId, slot, CONFIG.autoExpSlot - 1,
                        ContainerInput.SWAP, player);
                    return;
                }
            }
        }
        if (bottleSlot < 0) {
            return;
        }
        int selected = inventory.getSelectedSlot();
        InteractionHand hand = bottleSlot == Inventory.SLOT_OFFHAND ? InteractionHand.OFF_HAND : InteractionHand.MAIN_HAND;
        if (hand == InteractionHand.MAIN_HAND) {
            inventory.setSelectedSlot(bottleSlot);
        }
        float pitch = player.getXRot();
        player.connection.send(new ServerboundMovePlayerPacket.Rot(player.getYRot(), 90, player.onGround(), player.horizontalCollision));
        client.gameMode.useItem(player, hand);
        player.connection.send(new ServerboundMovePlayerPacket.Rot(player.getYRot(), pitch, player.onGround(), player.horizontalCollision));
        if (hand == InteractionHand.MAIN_HAND && inventory.getSelectedSlot() == bottleSlot) {
            inventory.setSelectedSlot(selected);
        }
    }

    private static boolean needsExpRepair(ItemStack stack, int durabilityPercent) {
        if (stack.isEmpty() || !stack.isDamageableItem() || stack.getMaxDamage() == 0
            || stack.getEnchantments().keySet().stream().noneMatch(enchantment -> enchantment.is(Enchantments.MENDING))) {
            return false;
        }
        return (stack.getMaxDamage() - stack.getDamageValue()) * 100.0 / stack.getMaxDamage() <= durabilityPercent;
    }

    private static int findAutoEatFood(LocalPlayer player) {
        boolean needsFood = player.getFoodData().needsFood();
        if (autoEatFood(player.getOffhandItem(), needsFood)) {
            return Inventory.SLOT_OFFHAND;
        }
        Inventory inventory = player.getInventory();
        int slot = findBestFood(inventory, 0, Inventory.SELECTION_SIZE, needsFood);
        if (slot >= 0 || !CONFIG.autoEatSearchInventory) {
            return slot;
        }
        return findBestFood(inventory, Inventory.SELECTION_SIZE, 36, needsFood);
    }

    private static int findBestFood(Inventory inventory, int start, int end, boolean needsFood) {
        int bestSlot = -1;
        float bestValue = -1;
        for (int slot = start; slot < end; slot++) {
            ItemStack stack = inventory.getItem(slot);
            if (!autoEatFood(stack, needsFood)) {
                continue;
            }
            var food = stack.get(DataComponents.FOOD);
            float value = switch (CONFIG.autoEatPriority) {
                case COMBINED -> food.nutrition() + food.saturation();
                case HUNGER -> food.nutrition();
                case SATURATION -> food.saturation();
            };
            if (value > bestValue) {
                bestValue = value;
                bestSlot = slot;
            }
        }
        return bestSlot;
    }

    private static boolean autoEatFood(ItemStack stack, boolean needsFood) {
        var food = stack.get(DataComponents.FOOD);
        return stack.has(DataComponents.CONSUMABLE) && food != null
            && !CONFIG.autoEatBlacklist.contains(BuiltInRegistries.ITEM.getKey(stack.getItem()).toString())
            && (needsFood || food.canAlwaysEat());
    }

    private static void stopAutoEat(Minecraft client) {
        if (autoEatHand == null) {
            return;
        }
        client.options.keyUse.setDown(false);
        if (autoEatFoodSlot >= 0 && client.player == autoEatPlayer
            && client.player.getInventory().getSelectedSlot() == autoEatFoodSlot) {
            client.player.getInventory().setSelectedSlot(autoEatPreviousSlot);
        }
        autoEatHand = null;
        autoEatPlayer = null;
        autoEatFoodSlot = -1;
        autoEatPreviousSlot = -1;
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

    private enum CriticalPhase {
        IDLE, WAIT, UP, DOWN, ATTACK, RESET
    }

    public static void turnCamera(double yaw, double pitch) {
        cameraYaw += (float) yaw * 0.15F;
        cameraPitch = Mth.clamp(cameraPitch + (float) pitch * 0.15F, -90, 90);
    }

    private static void renderHighlights(LevelRenderContext context) {
        Minecraft client = Minecraft.getInstance();
        if (client.level == null || client.player == null
            || (!enabled(Module.HITBOX) && !enabled(Module.STORAGE_ESP))) {
            return;
        }
        try (var gizmos = context.levelRenderer().collectPerFrameRenderThreadGizmos()) {
            if (enabled(Module.HITBOX)) {
                for (Entity entity : client.level.entitiesForRendering()) {
                    if (target(entity)) {
                        Gizmos.cuboid(entity.getBoundingBox().inflate(entity.getPickRadius()),
                            GizmoStyle.stroke(entity instanceof Player ? 0xFFFF4444 : 0xFFFFD68A)).setAlwaysOnTop();
                    }
                }
            }
            if (enabled(Module.STORAGE_ESP)) {
                BlockPos center = client.player.blockPosition();
                int centerX = center.getX() >> 4;
                int centerZ = center.getZ() >> 4;
                for (int x = centerX - 8; x <= centerX + 8; x++) {
                    for (int z = centerZ - 8; z <= centerZ + 8; z++) {
                        var chunk = client.level.getChunkSource().getChunk(x, z, ChunkStatus.FULL, false);
                        if (chunk == null) {
                            continue;
                        }
                        for (var storage : chunk.getBlockEntities().values()) {
                            if (storage instanceof ChestBlockEntity || storage instanceof BarrelBlockEntity
                                || storage instanceof ShulkerBoxBlockEntity || storage instanceof EnderChestBlockEntity) {
                                Gizmos.cuboid(new AABB(storage.getBlockPos()),
                                    GizmoStyle.stroke(0xFF55DDE0)).setAlwaysOnTop();
                            }
                        }
                    }
                }
            }
        }
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
            for (OreTools.Ore ore : ORES.nearest()) {
                if (!client.level.hasChunkAt(ore.position()) || !client.level.getBlockState(ore.position()).is(ore.block())) {
                    continue;
                }
                BlockPos block = ore.position();
                String name = ore.block().getName().getString();
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

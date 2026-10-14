package dev.lobster;

import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import net.fabricmc.api.ModInitializer;
import net.fabricmc.fabric.api.event.player.PlayerBlockBreakEvents;
import net.fabricmc.fabric.api.networking.v1.PayloadTypeRegistry;
import net.fabricmc.fabric.api.networking.v1.ServerPlayConnectionEvents;
import net.fabricmc.fabric.api.networking.v1.ServerPlayNetworking;
import net.minecraft.core.BlockPos;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.network.RegistryFriendlyByteBuf;
import net.minecraft.network.codec.ByteBufCodecs;
import net.minecraft.network.codec.StreamCodec;
import net.minecraft.network.protocol.common.custom.CustomPacketPayload;
import net.minecraft.resources.Identifier;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.state.BlockState;

public final class VeinminerServer implements ModInitializer {
    public static final float HITBOX_MARGIN = 4.0F;
    private final Set<UUID> enabled = new HashSet<>();
    private final Set<UUID> mining = new HashSet<>();
    private static final Set<UUID> hitboxEnabled = new HashSet<>();

    public record TogglePayload(boolean enabled) implements CustomPacketPayload {
        public static final Type<TogglePayload> TYPE = new Type<>(Identifier.fromNamespaceAndPath("lobster_client", "veinminer"));
        public static final StreamCodec<RegistryFriendlyByteBuf, TogglePayload> CODEC =
            StreamCodec.composite(ByteBufCodecs.BOOL, TogglePayload::enabled, TogglePayload::new);

        @Override
        public Type<TogglePayload> type() {
            return TYPE;
        }
    }

    public record HitboxTogglePayload(boolean enabled) implements CustomPacketPayload {
        public static final Type<HitboxTogglePayload> TYPE = new Type<>(Identifier.fromNamespaceAndPath("lobster_client", "hitbox"));
        public static final StreamCodec<RegistryFriendlyByteBuf, HitboxTogglePayload> CODEC =
            StreamCodec.composite(ByteBufCodecs.BOOL, HitboxTogglePayload::enabled, HitboxTogglePayload::new);

        @Override
        public Type<HitboxTogglePayload> type() {
            return TYPE;
        }
    }

    public static boolean hitboxEnabled(ServerPlayer player) {
        return hitboxEnabled.contains(player.getUUID());
    }

    @Override
    public void onInitialize() {
        PayloadTypeRegistry.serverboundPlay().register(TogglePayload.TYPE, TogglePayload.CODEC);
        PayloadTypeRegistry.serverboundPlay().register(HitboxTogglePayload.TYPE, HitboxTogglePayload.CODEC);
        ServerPlayNetworking.registerGlobalReceiver(TogglePayload.TYPE, (payload, context) -> {
            UUID playerId = context.player().getUUID();
            if (payload.enabled()) {
                enabled.add(playerId);
            } else {
                enabled.remove(playerId);
            }
        });
        ServerPlayNetworking.registerGlobalReceiver(HitboxTogglePayload.TYPE, (payload, context) -> {
            UUID playerId = context.player().getUUID();
            if (payload.enabled()) {
                hitboxEnabled.add(playerId);
            } else {
                hitboxEnabled.remove(playerId);
            }
        });
        ServerPlayConnectionEvents.DISCONNECT.register((handler, server) -> {
            enabled.remove(handler.player.getUUID());
            hitboxEnabled.remove(handler.player.getUUID());
        });
        PlayerBlockBreakEvents.AFTER.register((level, player, pos, state, blockEntity) -> {
            if (!(level instanceof ServerLevel world) || !(player instanceof ServerPlayer serverPlayer)
                || !enabled.contains(player.getUUID()) || mining.contains(player.getUUID()) || !isOre(state)) {
                return;
            }
            UUID playerId = player.getUUID();
            Block ore = state.getBlock();
            BlockPos seed = pos.immutable();
            world.getServer().schedule(world.getServer().wrapRunnable(() -> {
                if (!enabled.contains(playerId) || !serverPlayer.isAlive() || serverPlayer.level() != world) {
                    return;
                }
                mining.add(playerId);
                try {
                    for (BlockPos target : findVein(world, seed, ore)) {
                        if (target.equals(seed)) {
                            continue;
                        }
                        BlockState targetState = world.getBlockState(target);
                        if (!targetState.is(ore)) {
                            continue;
                        }
                        if (!serverPlayer.isCreative() && !serverPlayer.getMainHandItem().isCorrectToolForDrops(targetState)) {
                            break;
                        }
                        serverPlayer.gameMode.destroyBlock(target);
                    }
                } finally {
                    mining.remove(playerId);
                }
            }));
        });
    }

    public static boolean isOre(BlockState state) {
        String name = BuiltInRegistries.BLOCK.getKey(state.getBlock()).getPath();
        return name.endsWith("_ore") || name.equals("ancient_debris");
    }

    public static List<BlockPos> findVein(Level level, BlockPos seed, Block ore) {
        ArrayDeque<BlockPos> pending = new ArrayDeque<>();
        Set<BlockPos> visited = new HashSet<>();
        List<BlockPos> vein = new ArrayList<>();
        pending.add(seed);
        visited.add(seed);
        while (!pending.isEmpty() && vein.size() < 64) {
            BlockPos pos = pending.removeFirst();
            if (!level.hasChunkAt(pos) || (!pos.equals(seed) && !level.getBlockState(pos).is(ore))) {
                continue;
            }
            vein.add(pos);
            for (BlockPos neighbor : BlockPos.betweenClosed(pos.offset(-1, -1, -1), pos.offset(1, 1, 1))) {
                BlockPos next = neighbor.immutable();
                if (visited.add(next)) {
                    pending.addLast(next);
                }
            }
        }
        return vein;
    }
}

package dev.lobster.client;

import java.util.ArrayDeque;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import net.minecraft.client.Minecraft;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.phys.BlockHitResult;
import net.minecraft.world.phys.HitResult;
import net.minecraft.world.phys.Vec3;

public final class OreTools {
    public record Ore(BlockPos position, Block block) {}

    private static final int RADIUS = 24;
    private static final int WIDTH = RADIUS * 2 + 1;
    private final Map<Block, Ore> scanning = new HashMap<>();
    private List<Ore> nearest = List.of();
    private BlockPos scanOrigin;
    private int scanIndex;
    private final ArrayDeque<BlockPos> vein = new ArrayDeque<>();
    private Block veinBlock;
    private BlockPos mining;
    private int miningTicks;

    public static boolean isOre(BlockState state) {
        String name = BuiltInRegistries.BLOCK.getKey(state.getBlock()).getPath();
        return name.endsWith("_ore") || name.equals("ancient_debris");
    }

    public List<Ore> nearest() {
        return nearest;
    }

    public void reset() {
        scanning.clear();
        nearest = List.of();
        scanOrigin = null;
        scanIndex = 0;
        vein.clear();
        mining = null;
    }

    public void scan(Minecraft client) {
        if (scanOrigin == null || scanOrigin.distSqr(client.player.blockPosition()) > 256) {
            scanOrigin = client.player.blockPosition();
            scanIndex = 0;
            scanning.clear();
            nearest = List.of();
        }
        // Spread scanning across ticks to avoid a frame spike on large ore deposits.
        for (int count = 0; count < 3000 && scanIndex < WIDTH * WIDTH * WIDTH; count++, scanIndex++) {
            int x = scanIndex % WIDTH - RADIUS;
            int y = scanIndex / WIDTH % WIDTH - RADIUS;
            int z = scanIndex / (WIDTH * WIDTH) - RADIUS;
            BlockPos pos = scanOrigin.offset(x, y, z);
            if (!client.level.hasChunkAt(pos)) {
                continue;
            }
            BlockState state = client.level.getBlockState(pos);
            if (!isOre(state)) {
                continue;
            }
            Ore old = scanning.get(state.getBlock());
            if (old == null || pos.distSqr(scanOrigin) < old.position().distSqr(scanOrigin)) {
                scanning.put(state.getBlock(), new Ore(pos, state.getBlock()));
            }
        }
        if (scanIndex == WIDTH * WIDTH * WIDTH) {
            nearest = scanning.values().stream()
                .sorted(Comparator.comparingDouble(ore -> ore.position().distSqr(client.player.blockPosition())))
                .limit(8).toList();
            scanOrigin = client.player.blockPosition();
            scanning.clear();
            scanIndex = 0;
        }
    }

    public void stopMining(Minecraft client) {
        if (mining != null && client.gameMode != null) {
            client.gameMode.stopDestroyBlock();
        }
        vein.clear();
        mining = null;
    }

    public boolean mine(Minecraft client, boolean held) {
        if (!held || client.player == null || client.gameMode == null || client.gameMode.isSpectator()
            || client.player.isHandsBusy() || client.player.isUsingItem()) {
            stopMining(client);
            return false;
        }
        if (vein.isEmpty()) {
            if (!(client.hitResult instanceof BlockHitResult hit) || hit.getType() != HitResult.Type.BLOCK) {
                return false;
            }
            BlockPos seed = hit.getBlockPos();
            BlockState state = client.level.getBlockState(seed);
            if (!isOre(state)) {
                return false;
            }
            veinBlock = state.getBlock();
            ArrayDeque<BlockPos> pending = new ArrayDeque<>();
            Set<BlockPos> visited = new HashSet<>();
            pending.add(seed);
            visited.add(seed);
            while (!pending.isEmpty() && vein.size() < 64) {
                BlockPos pos = pending.removeFirst();
                if (!client.level.hasChunkAt(pos) || !client.level.getBlockState(pos).is(veinBlock)) {
                    continue;
                }
                vein.add(pos);
                for (Direction direction : Direction.values()) {
                    BlockPos next = pos.relative(direction);
                    if (visited.add(next)) {
                        pending.addLast(next);
                    }
                }
            }
        }
        while (!vein.isEmpty()) {
            BlockPos target = vein.peekFirst();
            double reach = client.player.blockInteractionRange();
            if (!client.level.getBlockState(target).is(veinBlock)
                || client.player.getEyePosition().distanceToSqr(Vec3.atCenterOf(target)) > reach * reach) {
                vein.removeFirst();
                continue;
            }
            if (!target.equals(mining)) {
                client.gameMode.stopDestroyBlock();
                mining = target;
                miningTicks = 0;
                client.gameMode.startDestroyBlock(target, Direction.UP);
            }
            client.gameMode.continueDestroyBlock(target, Direction.UP);
            client.player.swing(InteractionHand.MAIN_HAND, client.player.getMainHandItem().getAttackAnimation(), false);
            if (++miningTicks > 200) {
                // A protected or unreachable block must not trap the mining queue.
                vein.removeFirst();
                client.gameMode.stopDestroyBlock();
                mining = null;
            }
            return true;
        }
        stopMining(client);
        return false;
    }
}

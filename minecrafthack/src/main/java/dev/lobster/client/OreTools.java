package dev.lobster.client;

import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import dev.lobster.VeinminerServer;
import net.minecraft.client.Minecraft;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.level.ChunkPos;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.chunk.LevelChunk;
import net.minecraft.world.level.chunk.LevelChunkSection;
import net.minecraft.world.level.chunk.status.ChunkStatus;
import net.minecraft.world.phys.BlockHitResult;
import net.minecraft.world.phys.HitResult;
import net.minecraft.world.phys.Vec3;

public final class OreTools {
    public record Ore(BlockPos position, Block block) {}

    private static final int RADIUS = 500;
    private final Map<Block, Ore> scanning = new HashMap<>();
    private List<Ore> nearest = List.of();
    private BlockPos scanOrigin;
    private List<ChunkPos> scanChunks = List.of();
    private int scanChunkIndex;
    private int scanSectionIndex;
    private int scanBlockIndex;
    private final ArrayDeque<BlockPos> vein = new ArrayDeque<>();
    private Block veinBlock;
    private BlockPos mining;
    private int miningTicks;
    private boolean autoMining;

    public static boolean isOre(BlockState state) {
        return VeinminerServer.isOre(state);
    }

    public List<Ore> nearest() {
        return nearest;
    }

    public void reset() {
        scanning.clear();
        nearest = List.of();
        scanOrigin = null;
        scanChunks = List.of();
        scanChunkIndex = 0;
        scanSectionIndex = 0;
        scanBlockIndex = 0;
        vein.clear();
        mining = null;
        autoMining = false;
    }

    public void scan(Minecraft client) {
        BlockPos playerPos = client.player.blockPosition();
        long dx = scanOrigin == null ? 0 : playerPos.getX() - scanOrigin.getX();
        long dz = scanOrigin == null ? 0 : playerPos.getZ() - scanOrigin.getZ();
        boolean moved = scanOrigin == null || dx * dx + dz * dz > 256;
        if (moved || scanChunkIndex >= scanChunks.size()) {
            scanOrigin = playerPos;
            List<ChunkPos> loaded = new ArrayList<>();
            int minX = Math.floorDiv(playerPos.getX() - RADIUS, 16);
            int maxX = Math.floorDiv(playerPos.getX() + RADIUS, 16);
            int minZ = Math.floorDiv(playerPos.getZ() - RADIUS, 16);
            int maxZ = Math.floorDiv(playerPos.getZ() + RADIUS, 16);
            for (int x = minX; x <= maxX; x++) {
                for (int z = minZ; z <= maxZ; z++) {
                    if (client.level.getChunkSource().getChunk(x, z, ChunkStatus.FULL, false) != null) {
                        loaded.add(new ChunkPos(x, z));
                    }
                }
            }
            loaded.sort(Comparator.comparingLong(chunk -> {
                long x = (long) chunk.getMiddleBlockX() - playerPos.getX();
                long z = (long) chunk.getMiddleBlockZ() - playerPos.getZ();
                return x * x + z * z;
            }));
            scanChunks = loaded;
            scanChunkIndex = 0;
            scanSectionIndex = 0;
            scanBlockIndex = 0;
            if (moved) {
                scanning.clear();
                nearest = List.of();
            }
        }

        int blocksLeft = 12000;
        int sectionsLeft = 128;
        while (blocksLeft > 0 && sectionsLeft > 0 && scanChunkIndex < scanChunks.size()) {
            ChunkPos chunkPos = scanChunks.get(scanChunkIndex);
            LevelChunk chunk = client.level.getChunkSource().getChunk(chunkPos.x(), chunkPos.z(), ChunkStatus.FULL, false);
            if (chunk == null || scanSectionIndex >= chunk.getSections().length) {
                scanChunkIndex++;
                scanSectionIndex = 0;
                scanBlockIndex = 0;
                continue;
            }
            LevelChunkSection section = chunk.getSections()[scanSectionIndex];
            sectionsLeft--;
            if (!section.maybeHas(OreTools::isOre)) {
                scanSectionIndex++;
                scanBlockIndex = 0;
                continue;
            }
            int sectionY = chunk.getMinY() + scanSectionIndex * 16;
            while (blocksLeft > 0 && scanBlockIndex < 4096) {
                int index = scanBlockIndex++;
                blocksLeft--;
                int x = chunkPos.getBlockX(index & 15);
                int z = chunkPos.getBlockZ((index >> 4) & 15);
                long offsetX = x - scanOrigin.getX();
                long offsetZ = z - scanOrigin.getZ();
                if (offsetX * offsetX + offsetZ * offsetZ > (long) RADIUS * RADIUS) {
                    continue;
                }
                int y = index >> 8;
                BlockState state = section.getBlockState(index & 15, y, (index >> 4) & 15);
                if (isOre(state)) {
                    BlockPos pos = new BlockPos(x, sectionY + y, z);
                    Ore old = scanning.get(state.getBlock());
                    if (old == null || !client.level.hasChunkAt(old.position())
                        || !client.level.getBlockState(old.position()).is(old.block())
                        || pos.distSqr(scanOrigin) < old.position().distSqr(scanOrigin)) {
                        scanning.put(state.getBlock(), new Ore(pos, state.getBlock()));
                    }
                }
            }
            if (scanBlockIndex == 4096) {
                scanSectionIndex++;
                scanBlockIndex = 0;
            }
        }
        if (!scanning.isEmpty() || scanChunkIndex >= scanChunks.size()) {
            nearest = scanning.values().stream()
                .filter(ore -> {
                    long x = ore.position().getX() - playerPos.getX();
                    long z = ore.position().getZ() - playerPos.getZ();
                    return x * x + z * z <= (long) RADIUS * RADIUS
                        && client.level.hasChunkAt(ore.position())
                        && client.level.getBlockState(ore.position()).is(ore.block());
                })
                .sorted(Comparator.comparingDouble(ore -> ore.position().distSqr(playerPos)))
                .limit(8).toList();
        }
    }

    public void stopMining(Minecraft client) {
        if (mining != null && client.gameMode != null) {
            client.gameMode.stopDestroyBlock();
        }
        vein.clear();
        mining = null;
        autoMining = false;
    }

    public boolean mine(Minecraft client, boolean held) {
        if (LobsterClient.serverVeinminer()) {
            stopMining(client);
            return false;
        }
        if (client.player == null || client.gameMode == null || client.gameMode.isSpectator()
            || client.player.isHandsBusy() || client.player.isUsingItem()) {
            stopMining(client);
            return false;
        }
        if (mining != null && client.level.getBlockState(mining).isAir()) {
            autoMining = true;
        }
        if (!held && !autoMining) {
            stopMining(client);
            return false;
        }
        if (vein.isEmpty()) {
            if (!held) {
                stopMining(client);
                return false;
            }
            if (!(client.hitResult instanceof BlockHitResult hit) || hit.getType() != HitResult.Type.BLOCK) {
                return false;
            }
            BlockPos seed = hit.getBlockPos();
            BlockState state = client.level.getBlockState(seed);
            if (!isOre(state)) {
                return false;
            }
            veinBlock = state.getBlock();
            vein.addAll(VeinminerServer.findVein(client.level, seed, veinBlock));
        }
        int remaining = vein.size();
        while (remaining-- > 0) {
            BlockPos target = vein.peekFirst();
            double reach = client.player.blockInteractionRange();
            if (!client.level.getBlockState(target).is(veinBlock)) {
                vein.removeFirst();
                continue;
            }
            if (client.player.getEyePosition().distanceToSqr(Vec3.atCenterOf(target)) > reach * reach) {
                // Keep distant members of the vein until the player moves closer.
                vein.addLast(vein.removeFirst());
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
        if (!vein.isEmpty()) {
            if (mining != null) {
                client.gameMode.stopDestroyBlock();
                mining = null;
            }
            return true;
        }
        stopMining(client);
        return false;
    }
}

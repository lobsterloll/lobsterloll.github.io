package dev.lobster.client.mixin;

import dev.lobster.VeinminerServer;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.server.network.ServerGamePacketListenerImpl;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.Shadow;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.ModifyArg;

@Mixin(ServerGamePacketListenerImpl.class)
public abstract class ServerGamePacketListenerMixin {
    @Shadow public ServerPlayer player;

    @ModifyArg(method = "handleAttack", at = @At(value = "INVOKE",
        target = "Lnet/minecraft/server/level/ServerPlayer;isWithinAttackRange(Lnet/minecraft/world/item/ItemStack;Lnet/minecraft/world/phys/AABB;D)Z"),
        index = 2)
    private double lobster$expandedAttackRange(double tolerance) {
        return VeinminerServer.hitboxEnabled(player) ? tolerance + VeinminerServer.HITBOX_MARGIN : tolerance;
    }
}

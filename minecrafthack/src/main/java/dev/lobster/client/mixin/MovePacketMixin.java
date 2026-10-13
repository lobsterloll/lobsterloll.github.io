package dev.lobster.client.mixin;

import dev.lobster.client.LobsterClient;
import dev.lobster.client.Module;
import net.minecraft.client.Minecraft;
import net.minecraft.network.protocol.game.ServerboundMovePlayerPacket;
import org.spongepowered.asm.mixin.Final;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.Mutable;
import org.spongepowered.asm.mixin.Shadow;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

@Mixin(ServerboundMovePlayerPacket.class)
public abstract class MovePacketMixin {
    @Shadow @Final @Mutable protected boolean onGround;

    @Inject(method = "<init>", at = @At("RETURN"))
    private void lobster$noFall(CallbackInfo ci) {
        Minecraft client = Minecraft.getInstance();
        var player = client.player;
        if (client.isSameThread() && player != null && LobsterClient.enabled(Module.NO_FALL) && !LobsterClient.freecam()
            && player.fallDistance > 2 && player.getDeltaMovement().y < 0) {
            onGround = true;
        }
    }
}

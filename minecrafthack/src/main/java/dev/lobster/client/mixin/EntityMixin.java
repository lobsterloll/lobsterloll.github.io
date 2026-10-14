package dev.lobster.client.mixin;

import dev.lobster.client.LobsterClient;
import dev.lobster.client.Module;
import net.minecraft.client.Minecraft;
import net.minecraft.world.entity.Entity;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable;

@Mixin(Entity.class)
public abstract class EntityMixin {
    @Inject(method = "turn", at = @At("HEAD"), cancellable = true)
    private void lobster$turnCamera(double yaw, double pitch, CallbackInfo ci) {
        if ((Object) this == Minecraft.getInstance().player && LobsterClient.freecam()) {
            LobsterClient.turnCamera(yaw, pitch);
            ci.cancel();
        }
    }

    @Inject(method = "getPickRadius", at = @At("RETURN"), cancellable = true)
    private void lobster$targetMargin(CallbackInfoReturnable<Float> cir) {
        Entity entity = (Entity) (Object) this;
        if (entity.level().isClientSide() && LobsterClient.enabled(Module.HITBOX) && LobsterClient.target(entity)) {
            cir.setReturnValue(cir.getReturnValue() + LobsterClient.HITBOX_MARGIN);
        }
    }
}

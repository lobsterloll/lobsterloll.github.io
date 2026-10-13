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

@Mixin(Minecraft.class)
public abstract class MinecraftMixin {
    @Inject(method = "shouldEntityAppearGlowing", at = @At("HEAD"), cancellable = true)
    private void lobster$esp(Entity entity, CallbackInfoReturnable<Boolean> cir) {
        if (LobsterClient.enabled(Module.ESP) && LobsterClient.target(entity)) {
            cir.setReturnValue(true);
        }
    }

    @Inject(method = "continueAttack", at = @At("HEAD"), cancellable = true)
    private void lobster$mineVein(boolean held, CallbackInfo ci) {
        if (LobsterClient.freecam()) {
            ci.cancel();
        } else if (LobsterClient.enabled(Module.VEINMINER)
            && LobsterClient.ORES.mine((Minecraft) (Object) this, held)) {
            ci.cancel();
        }
    }

    @Inject(method = "startAttack", at = @At("HEAD"), cancellable = true)
    private void lobster$blockFreecamAttack(CallbackInfoReturnable<Boolean> cir) {
        if (LobsterClient.freecam()) {
            cir.setReturnValue(false);
        } else if (LobsterClient.enabled(Module.VEINMINER)
            && LobsterClient.ORES.mine((Minecraft) (Object) this, true)) {
            cir.setReturnValue(false);
        }
    }

    @Inject(method = "startUseItem", at = @At("HEAD"), cancellable = true)
    private void lobster$blockFreecamUse(CallbackInfo ci) {
        if (LobsterClient.freecam()) {
            ci.cancel();
        }
    }
}

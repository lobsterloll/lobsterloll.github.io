package dev.lobster.client.mixin;

import dev.lobster.client.LobsterClient;
import dev.lobster.client.Module;
import net.minecraft.client.Minecraft;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.phys.EntityHitResult;
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
        } else {
            if (held) {
                LobsterClient.selectTool((Minecraft) (Object) this);
            }
            if (LobsterClient.enabled(Module.VEINMINER)
                && LobsterClient.ORES.mine((Minecraft) (Object) this, held)) {
                ci.cancel();
            }
        }
    }

    @Inject(method = "startAttack", at = @At("HEAD"), cancellable = true)
    private void lobster$blockFreecamAttack(CallbackInfoReturnable<Boolean> cir) {
        if (LobsterClient.freecam()) {
            cir.setReturnValue(false);
        } else {
            LobsterClient.selectTool((Minecraft) (Object) this);
            if (LobsterClient.enabled(Module.VEINMINER)
                && LobsterClient.ORES.mine((Minecraft) (Object) this, true)) {
                cir.setReturnValue(false);
            }
        }
    }

    @Inject(method = "startAttack", at = @At(value = "INVOKE",
        target = "Lnet/minecraft/client/multiplayer/MultiPlayerGameMode;attack(Lnet/minecraft/world/entity/player/Player;Lnet/minecraft/world/entity/Entity;)V"),
        cancellable = true)
    private void lobster$delayManualCrit(CallbackInfoReturnable<Boolean> cir) {
        Minecraft client = (Minecraft) (Object) this;
        if (client.hitResult instanceof EntityHitResult hit
            && LobsterClient.delayCriticalAttack(client.player, hit.getEntity())) {
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

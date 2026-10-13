package dev.lobster.client.mixin;

import dev.lobster.client.LobsterClient;
import dev.lobster.client.Module;
import net.minecraft.client.renderer.LightmapRenderStateExtractor;
import net.minecraft.client.renderer.state.LightmapRenderState;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

@Mixin(LightmapRenderStateExtractor.class)
public abstract class LightmapMixin {
    @Inject(method = "extract", at = @At("TAIL"))
    private void lobster$fullbright(LightmapRenderState state, float partialTicks, CallbackInfo ci) {
        if (LobsterClient.enabled(Module.FULLBRIGHT)) {
            state.needsUpdate = true;
            state.ambientColor = LightmapRenderStateExtractor.WHITE;
            state.darknessEffectScale = 0;
            state.bossOverlayWorldDarkening = 0;
        }
    }
}

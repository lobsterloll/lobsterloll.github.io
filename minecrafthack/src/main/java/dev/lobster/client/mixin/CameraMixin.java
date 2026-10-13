package dev.lobster.client.mixin;

import dev.lobster.client.LobsterClient;
import net.minecraft.client.Camera;
import net.minecraft.client.DeltaTracker;
import net.minecraft.client.renderer.state.level.CameraRenderState;
import net.minecraft.world.phys.Vec3;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.Shadow;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

@Mixin(Camera.class)
public abstract class CameraMixin {
    @Shadow private boolean detached;
    @Shadow protected abstract void setPosition(Vec3 position);
    @Shadow protected abstract void setRotation(float yaw, float pitch);

    @Inject(method = "alignWithEntity", at = @At("HEAD"), cancellable = true)
    private void lobster$freecam(float partialTicks, CallbackInfo ci) {
        if (LobsterClient.freecam()) {
            setPosition(LobsterClient.previousCameraPosition.lerp(LobsterClient.cameraPosition, partialTicks));
            setRotation(LobsterClient.cameraYaw, LobsterClient.cameraPitch);
            detached = true;
            ci.cancel();
        }
    }

    @Inject(method = "extractRenderState", at = @At("TAIL"))
    private void lobster$detachedView(CameraRenderState state, DeltaTracker tracker, CallbackInfo ci) {
        if (LobsterClient.freecam()) {
            state.isFirstPerson = false;
            state.smartCull = false;
        }
    }
}

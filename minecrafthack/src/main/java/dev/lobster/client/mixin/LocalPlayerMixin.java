package dev.lobster.client.mixin;

import dev.lobster.client.LobsterClient;
import dev.lobster.client.Module;
import net.minecraft.client.player.LocalPlayer;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.phys.AABB;
import net.minecraft.world.phys.EntityHitResult;
import net.minecraft.world.phys.HitResult;
import net.minecraft.world.phys.Vec3;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable;

@Mixin(LocalPlayer.class)
public abstract class LocalPlayerMixin {
    @Inject(method = "sendPosition", at = @At("HEAD"), cancellable = true)
    private void lobster$autoCritPosition(CallbackInfo ci) {
        if (LobsterClient.sendCriticalPosition((LocalPlayer) (Object) this)) {
            ci.cancel();
        }
    }

    @Inject(method = "raycastHitResult", at = @At("RETURN"), cancellable = true)
    private void lobster$expandedWeaponTarget(float partialTick, Entity camera, CallbackInfoReturnable<HitResult> cir) {
        if (!LobsterClient.enabled(Module.HITBOX) || cir.getReturnValue() instanceof EntityHitResult) {
            return;
        }
        LocalPlayer player = (LocalPlayer) (Object) this;
        Vec3 eye = camera.getEyePosition(partialTick);
        double reach = player.getAttackRangeWith(player.getActiveItem()).effectiveMaxRange(player);
        Vec3 direction = camera.getViewVector(partialTick);
        Vec3 end = eye.add(direction.scale(reach));
        AABB search = new AABB(eye, end).inflate(LobsterClient.HITBOX_MARGIN);
        double limit = cir.getReturnValue().getType() == HitResult.Type.BLOCK
            ? eye.distanceToSqr(cir.getReturnValue().getLocation()) : reach * reach;
        Entity closest = null;
        Vec3 closestPoint = null;
        double closestDistance = Double.POSITIVE_INFINITY;
        for (Entity entity : player.level().getEntities(player, search, LobsterClient::target)) {
            if (entity.getBoundingBox().getCenter().subtract(eye).dot(direction) <= 0
                || !player.hasLineOfSight(entity)) {
                continue;
            }
            AABB expanded = entity.getBoundingBox().inflate(LobsterClient.HITBOX_MARGIN);
            Vec3 point = expanded.contains(eye) ? eye : expanded.clip(eye, end).orElse(null);
            if (point == null || eye.distanceToSqr(point) > limit) {
                continue;
            }
            double distance = entity.getBoundingBox().distanceToSqr(eye);
            if (distance < closestDistance) {
                closest = entity;
                closestPoint = point;
                closestDistance = distance;
            }
        }
        if (closest != null) {
            cir.setReturnValue(new EntityHitResult(closest, closestPoint));
        }
    }
}

package dev.lobster.client;

import net.minecraft.client.KeyMapping;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.gui.components.Button;
import net.minecraft.client.gui.components.Tooltip;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.client.input.KeyEvent;
import net.minecraft.network.chat.Component;

public final class AutoExpScreen extends Screen {
    private final Screen parent;

    public AutoExpScreen(Screen parent) {
        super(Component.literal("Auto EXP"));
        this.parent = parent;
    }

    @Override
    protected void init() {
        ClientConfig config = LobsterClient.CONFIG;
        int buttonWidth = Math.min(220, (width - 36) / 2);
        int left = width / 2 - buttonWidth - 6;
        int right = left + buttonWidth + 12;
        int top = Math.max(38, height / 2 - 82);
        Button mode = Button.builder(Component.literal("Repair: " + config.autoExpMode), button -> {
            var values = ClientConfig.ExpMode.values();
            config.autoExpMode = values[(config.autoExpMode.ordinal() + 1) % values.length];
            button.setMessage(Component.literal("Repair: " + config.autoExpMode));
            LobsterClient.save();
        }).bounds(left, top, buttonWidth, 20).build();
        mode.setTooltip(Tooltip.create(Component.literal("Repair armor, held items, or both. Requires Mending.")));
        addRenderableWidget(mode);
        addRenderableWidget(Button.builder(Component.literal("Only on ground: " + (config.autoExpOnlyGround ? "ON" : "OFF")), button -> {
            config.autoExpOnlyGround = !config.autoExpOnlyGround;
            rebuildWidgets();
            LobsterClient.save();
        }).bounds(right, top, buttonWidth, 20).build());
        addRenderableWidget(Button.builder(Component.literal("Replenish bottles: " + (config.autoExpReplenish ? "ON" : "OFF")), button -> {
            config.autoExpReplenish = !config.autoExpReplenish;
            rebuildWidgets();
            LobsterClient.save();
        }).bounds(left, top + 25, buttonWidth, 20).build());
        addRenderableWidget(Button.builder(Component.literal("Bottle slot: " + config.autoExpSlot), button -> {
            config.autoExpSlot = config.autoExpSlot % 9 + 1;
            rebuildWidgets();
            LobsterClient.save();
        }).bounds(right, top + 25, buttonWidth, 20).build());
        addRenderableWidget(Button.builder(Component.literal("Start at: " + config.autoExpMinThreshold + "%  -"), button -> {
            config.autoExpMinThreshold = Math.max(1, config.autoExpMinThreshold - 5);
            rebuildWidgets();
            LobsterClient.save();
        }).bounds(left, top + 50, buttonWidth, 20).build());
        addRenderableWidget(Button.builder(Component.literal("Start at: " + config.autoExpMinThreshold + "%  +"), button -> {
            config.autoExpMinThreshold = Math.min(100, config.autoExpMinThreshold + 5);
            rebuildWidgets();
            LobsterClient.save();
        }).bounds(right, top + 50, buttonWidth, 20).build());
        addRenderableWidget(Button.builder(Component.literal("Stop at: " + config.autoExpMaxThreshold + "%  -"), button -> {
            config.autoExpMaxThreshold = Math.max(1, config.autoExpMaxThreshold - 5);
            rebuildWidgets();
            LobsterClient.save();
        }).bounds(left, top + 75, buttonWidth, 20).build());
        addRenderableWidget(Button.builder(Component.literal("Stop at: " + config.autoExpMaxThreshold + "%  +"), button -> {
            config.autoExpMaxThreshold = Math.min(100, config.autoExpMaxThreshold + 5);
            rebuildWidgets();
            LobsterClient.save();
        }).bounds(right, top + 75, buttonWidth, 20).build());
        addRenderableWidget(Button.builder(Component.literal("Done"), button -> onClose())
            .bounds(right, top + 100, buttonWidth, 20).build());
    }

    @Override
    public void extractRenderState(GuiGraphicsExtractor graphics, int mouseX, int mouseY, float partialTick) {
        graphics.fill(0, 0, width, height, 0xE8111720);
        graphics.centeredText(font, "AUTO EXP", width / 2, 12, 0xFFFF8A70);
        super.extractRenderState(graphics, mouseX, mouseY, partialTick);
    }

    @Override
    public boolean keyPressed(KeyEvent event) {
        if (KeyMapping.get("key.lobster_client.menu").matches(event)) {
            onClose();
            return true;
        }
        return super.keyPressed(event);
    }

    @Override
    public void onClose() {
        Minecraft.getInstance().gui.setScreen(parent);
    }

    @Override
    public boolean isPauseScreen() {
        return false;
    }
}

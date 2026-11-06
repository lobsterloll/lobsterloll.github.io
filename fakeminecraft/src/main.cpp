#include "world.hpp"
#include <volk.h>
#define VMA_IMPLEMENTATION
#define VMA_STATIC_VULKAN_FUNCTIONS 0
#define VMA_DYNAMIC_VULKAN_FUNCTIONS 1
#include <vk_mem_alloc.h>
#include <GLFW/glfw3.h>
#include <glm/glm.hpp>
#include <glm/gtc/matrix_transform.hpp>
#include <algorithm>
#include <array>
#include <chrono>
#include <cstring>
#include <fstream>
#include <filesystem>
#include <iostream>
#include <stdexcept>
#include <string>
#include <vector>
#include "../third_party/stb_easy_font.h"

namespace {
void check(VkResult result, const char* operation) { if (result != VK_SUCCESS) throw std::runtime_error(operation); }
std::vector<char> read_file(const char* name) {
    std::ifstream in(name,std::ios::binary|std::ios::ate);
    if (!in) throw std::runtime_error(std::string("Missing file: ")+name);
    std::vector<char> data(size_t(in.tellg())); in.seekg(0); in.read(data.data(),data.size()); return data;
}
VKAPI_ATTR VkBool32 VKAPI_CALL debug_callback(VkDebugUtilsMessageSeverityFlagBitsEXT severity, VkDebugUtilsMessageTypeFlagsEXT, const VkDebugUtilsMessengerCallbackDataEXT* data, void*) {
    if (severity>=VK_DEBUG_UTILS_MESSAGE_SEVERITY_WARNING_BIT_EXT) std::cerr << "Vulkan: " << data->pMessage << '\n';
    return VK_FALSE;
}
struct Buffer {
    VkBuffer handle = VK_NULL_HANDLE;
    VmaAllocation allocation = VK_NULL_HANDLE;
    VkDeviceSize size = 0;
};
struct Overlay {
    std::vector<Vertex> vertices;
    static glm::vec3 point(float x,float y,float z) { return {x/640.f-1.f,y/360.f-1.f,z}; }
    void rect(float x,float y,float w,float h,glm::vec3 color,float depth) {
        glm::vec3 normal=glm::normalize(glm::vec3(.6f,1.f,.35f));
        Vertex a{point(x,y,depth),normal,color}, b{point(x,y+h,depth),normal,color};
        Vertex c{point(x+w,y+h,depth),normal,color}, d{point(x+w,y,depth),normal,color};
        vertices.insert(vertices.end(),{a,b,c,a,c,d});
    }
    void tile_rect(float x,float y,float w,float h,int tile,float depth) {
        static const auto atlas=read_file("assets/ui_atlas.rgba");
        for (int py=0;py<int(h);py+=8) for (int px=0;px<int(w);px+=8) {
            int sampleX=tile*16+(px/8)%16, sampleY=(py/8)%16;
            size_t offset=size_t(sampleY*160+sampleX)*4;
            glm::vec3 color{(unsigned char)atlas[offset]/255.f,(unsigned char)atlas[offset+1]/255.f,(unsigned char)atlas[offset+2]/255.f};
            rect(x+px,y+py,std::min(8.f,w-px),std::min(8.f,h-py),color,depth);
        }
    }
    void block_icon(float x,float y,float size,int id,float depth) {
        static const auto atlas=read_file("assets/block_atlas.rgba");
        int tile=id-1;
        if (tile<0) return;
        int originX=(tile%32)*16, originY=(tile/32)*16;
        float cell=size/16.f;
        for (int py=0;py<16;++py) for (int px=0;px<16;++px) {
            size_t offset=size_t((originY+py)*512+originX+px)*4;
            glm::vec3 color{(unsigned char)atlas[offset]/255.f,(unsigned char)atlas[offset+1]/255.f,(unsigned char)atlas[offset+2]/255.f};
            rect(x+px*cell,y+py*cell,cell,cell,color,depth);
        }
    }
    void text(float x,float y,std::string value,glm::vec3 color,float scale=1.25f,float depth=.004f) {
        std::vector<char> buffer(value.size()*512+1024);
        int count=stb_easy_font_print(0,0,value.data(),nullptr,buffer.data(),int(buffer.size()));
        struct GlyphVertex { float x,y,z; unsigned char rgba[4]; };
        auto* glyphs=reinterpret_cast<const GlyphVertex*>(buffer.data());
        glm::vec3 normal=glm::normalize(glm::vec3(.6f,1.f,.35f));
        for (int q=0;q<count;++q) {
            Vertex v[4];
            for (int i=0;i<4;++i) v[i]={point(x+glyphs[q*4+i].x*scale,y+glyphs[q*4+i].y*scale,depth),normal,color};
            vertices.insert(vertices.end(),{v[0],v[2],v[1],v[0],v[3],v[2]});
        }
    }
};
struct MouseButtons { bool leftPressed=false, rightPressed=false; };
struct Renderer {
    GLFWwindow* window = nullptr;
    VkInstance instance = VK_NULL_HANDLE;
    VkDebugUtilsMessengerEXT debug = VK_NULL_HANDLE;
    VkSurfaceKHR surface = VK_NULL_HANDLE;
    VkPhysicalDevice physical = VK_NULL_HANDLE;
    VkDevice device = VK_NULL_HANDLE;
    VkQueue graphics = VK_NULL_HANDLE, present = VK_NULL_HANDLE;
    uint32_t graphicsFamily = 0, presentFamily = 0;
    VmaAllocator allocator = VK_NULL_HANDLE;
    VkSwapchainKHR swapchain = VK_NULL_HANDLE;
    VkFormat format{};
    VkExtent2D extent{};
    std::vector<VkImage> images;
    std::vector<VkImageView> views;
    VkImage depthImage = VK_NULL_HANDLE;
    VmaAllocation depthAllocation = VK_NULL_HANDLE;
    VkImageView depthView = VK_NULL_HANDLE;
    VkRenderPass renderPass = VK_NULL_HANDLE;
    VkPipelineLayout pipelineLayout = VK_NULL_HANDLE;
    VkPipelineLayout uiPipelineLayout = VK_NULL_HANDLE;
    VkPipeline pipeline = VK_NULL_HANDLE;
    VkPipeline uiPipeline = VK_NULL_HANDLE;
    VkDescriptorSetLayout atlasLayout = VK_NULL_HANDLE;
    VkDescriptorPool atlasPool = VK_NULL_HANDLE;
    VkDescriptorSet atlasSet = VK_NULL_HANDLE;
    VkImage atlasImage = VK_NULL_HANDLE;
    VmaAllocation atlasAllocation = VK_NULL_HANDLE;
    VkImageView atlasView = VK_NULL_HANDLE;
    VkSampler atlasSampler = VK_NULL_HANDLE;
    std::vector<VkFramebuffer> framebuffers;
    VkCommandPool commandPool = VK_NULL_HANDLE;
    std::array<VkCommandBuffer,2> commands{};
    std::array<VkSemaphore,2> acquired{}, finished{};
    std::array<VkFence,2> fences{};
    std::vector<VkFence> imageFences;
    Buffer vertex, index;
    std::array<Buffer,2> overlayBuffers{};
    uint32_t indexCount = 0;
    int frame = 0;
    bool validation = false;

    explicit Renderer(GLFWwindow* w) : window(w) {
        try { initialize(); } catch (...) { cleanup(); throw; }
    }
    void initialize() {
        check(volkInitialize(),"volkInitialize");
#ifndef NDEBUG
        validation = true;
#endif
        uint32_t layerCount=0; vkEnumerateInstanceLayerProperties(&layerCount,nullptr);
        std::vector<VkLayerProperties> layers(layerCount); vkEnumerateInstanceLayerProperties(&layerCount,layers.data());
        bool layerPresent=false;
        for (auto& layer:layers) if (std::strcmp(layer.layerName,"VK_LAYER_KHRONOS_validation")==0) layerPresent=true;
        if (validation && !layerPresent) throw std::runtime_error("Debug build requires VK_LAYER_KHRONOS_validation. Install Vulkan SDK or build Release.");
        uint32_t extensionCount=0;
        const char** required=glfwGetRequiredInstanceExtensions(&extensionCount);
        std::vector<const char*> extensions(required,required+extensionCount);
        if (validation) extensions.push_back(VK_EXT_DEBUG_UTILS_EXTENSION_NAME);
        const char* validationLayer="VK_LAYER_KHRONOS_validation";
        VkApplicationInfo app{VK_STRUCTURE_TYPE_APPLICATION_INFO}; app.pApplicationName="Stonefield"; app.apiVersion=VK_API_VERSION_1_3;
        VkInstanceCreateInfo info{VK_STRUCTURE_TYPE_INSTANCE_CREATE_INFO};
        info.pApplicationInfo=&app; info.enabledExtensionCount=uint32_t(extensions.size()); info.ppEnabledExtensionNames=extensions.data();
        if (validation) { info.enabledLayerCount=1; info.ppEnabledLayerNames=&validationLayer; }
        check(vkCreateInstance(&info,nullptr,&instance),"vkCreateInstance"); volkLoadInstance(instance);
        if (validation) {
            VkDebugUtilsMessengerCreateInfoEXT dbg{VK_STRUCTURE_TYPE_DEBUG_UTILS_MESSENGER_CREATE_INFO_EXT};
            dbg.messageSeverity=VK_DEBUG_UTILS_MESSAGE_SEVERITY_WARNING_BIT_EXT|VK_DEBUG_UTILS_MESSAGE_SEVERITY_ERROR_BIT_EXT;
            dbg.messageType=VK_DEBUG_UTILS_MESSAGE_TYPE_GENERAL_BIT_EXT|VK_DEBUG_UTILS_MESSAGE_TYPE_VALIDATION_BIT_EXT|VK_DEBUG_UTILS_MESSAGE_TYPE_PERFORMANCE_BIT_EXT;
            dbg.pfnUserCallback=debug_callback;
            check(vkCreateDebugUtilsMessengerEXT(instance,&dbg,nullptr,&debug),"debug messenger");
        }
        check(glfwCreateWindowSurface(instance,window,nullptr,&surface),"window surface");
        uint32_t deviceCount=0; check(vkEnumeratePhysicalDevices(instance,&deviceCount,nullptr),"enumerate devices");
        std::vector<VkPhysicalDevice> devices(deviceCount); vkEnumeratePhysicalDevices(instance,&deviceCount,devices.data());
        for (auto candidate:devices) {
            VkPhysicalDeviceProperties properties{}; vkGetPhysicalDeviceProperties(candidate,&properties);
            if (properties.apiVersion<VK_API_VERSION_1_3) continue;
            uint32_t count=0; vkGetPhysicalDeviceQueueFamilyProperties(candidate,&count,nullptr);
            std::vector<VkQueueFamilyProperties> families(count); vkGetPhysicalDeviceQueueFamilyProperties(candidate,&count,families.data());
            int g=-1,p=-1;
            for (uint32_t i=0;i<count;++i) {
                if (families[i].queueFlags&VK_QUEUE_GRAPHICS_BIT) g=int(i);
                VkBool32 supported=VK_FALSE; vkGetPhysicalDeviceSurfaceSupportKHR(candidate,i,surface,&supported);
                if (supported) p=int(i);
            }
            uint32_t extensionTotal=0; vkEnumerateDeviceExtensionProperties(candidate,nullptr,&extensionTotal,nullptr);
            std::vector<VkExtensionProperties> deviceExtensions(extensionTotal);
            vkEnumerateDeviceExtensionProperties(candidate,nullptr,&extensionTotal,deviceExtensions.data());
            bool swapSupport=false; for (auto& ext:deviceExtensions) if (std::strcmp(ext.extensionName,VK_KHR_SWAPCHAIN_EXTENSION_NAME)==0) swapSupport=true;
            if (g>=0 && p>=0 && swapSupport) { physical=candidate; graphicsFamily=uint32_t(g); presentFamily=uint32_t(p); break; }
        }
        if (!physical) throw std::runtime_error("No Vulkan 1.3 GPU with swapchain support");
        float priority=1;
        std::vector<VkDeviceQueueCreateInfo> queues;
        for (uint32_t family: {graphicsFamily,presentFamily}) {
            if (!queues.empty() && family==graphicsFamily) continue;
            if (family==presentFamily && presentFamily==graphicsFamily && !queues.empty()) continue;
            VkDeviceQueueCreateInfo q{VK_STRUCTURE_TYPE_DEVICE_QUEUE_CREATE_INFO}; q.queueFamilyIndex=family; q.queueCount=1; q.pQueuePriorities=&priority; queues.push_back(q);
        }
        const char* swapExtension=VK_KHR_SWAPCHAIN_EXTENSION_NAME;
        VkPhysicalDeviceFeatures features{};
        VkDeviceCreateInfo create{VK_STRUCTURE_TYPE_DEVICE_CREATE_INFO};
        create.queueCreateInfoCount=uint32_t(queues.size()); create.pQueueCreateInfos=queues.data();
        create.enabledExtensionCount=1; create.ppEnabledExtensionNames=&swapExtension; create.pEnabledFeatures=&features;
        check(vkCreateDevice(physical,&create,nullptr,&device),"vkCreateDevice"); volkLoadDevice(device);
        vkGetDeviceQueue(device,graphicsFamily,0,&graphics); vkGetDeviceQueue(device,presentFamily,0,&present);
        VmaVulkanFunctions funcs{}; funcs.vkGetInstanceProcAddr=vkGetInstanceProcAddr; funcs.vkGetDeviceProcAddr=vkGetDeviceProcAddr;
        VmaAllocatorCreateInfo alloc{}; alloc.physicalDevice=physical; alloc.device=device; alloc.instance=instance; alloc.vulkanApiVersion=VK_API_VERSION_1_3; alloc.pVulkanFunctions=&funcs;
        check(vmaCreateAllocator(&alloc,&allocator),"vmaCreateAllocator");
        VkDescriptorSetLayoutBinding atlasBinding{};
        atlasBinding.binding=0; atlasBinding.descriptorType=VK_DESCRIPTOR_TYPE_COMBINED_IMAGE_SAMPLER; atlasBinding.descriptorCount=1; atlasBinding.stageFlags=VK_SHADER_STAGE_FRAGMENT_BIT;
        VkDescriptorSetLayoutCreateInfo atlasInfo{VK_STRUCTURE_TYPE_DESCRIPTOR_SET_LAYOUT_CREATE_INFO};
        atlasInfo.bindingCount=1; atlasInfo.pBindings=&atlasBinding;
        check(vkCreateDescriptorSetLayout(device,&atlasInfo,nullptr,&atlasLayout),"atlas descriptor layout");
        create_swapchain();
        VkCommandPoolCreateInfo pool{VK_STRUCTURE_TYPE_COMMAND_POOL_CREATE_INFO}; pool.queueFamilyIndex=graphicsFamily; pool.flags=VK_COMMAND_POOL_CREATE_RESET_COMMAND_BUFFER_BIT;
        check(vkCreateCommandPool(device,&pool,nullptr,&commandPool),"command pool");
        VkCommandBufferAllocateInfo cmd{VK_STRUCTURE_TYPE_COMMAND_BUFFER_ALLOCATE_INFO}; cmd.commandPool=commandPool; cmd.level=VK_COMMAND_BUFFER_LEVEL_PRIMARY; cmd.commandBufferCount=2;
        check(vkAllocateCommandBuffers(device,&cmd,commands.data()),"command buffers");
        for (int i=0;i<2;++i) {
            VkSemaphoreCreateInfo sem{VK_STRUCTURE_TYPE_SEMAPHORE_CREATE_INFO};
            VkFenceCreateInfo fence{VK_STRUCTURE_TYPE_FENCE_CREATE_INFO}; fence.flags=VK_FENCE_CREATE_SIGNALED_BIT;
            check(vkCreateSemaphore(device,&sem,nullptr,&acquired[i]),"acquire semaphore");
            check(vkCreateSemaphore(device,&sem,nullptr,&finished[i]),"finish semaphore");
            check(vkCreateFence(device,&fence,nullptr,&fences[i]),"frame fence");
            overlayBuffers[i]=make_buffer(200000*sizeof(Vertex),VK_BUFFER_USAGE_VERTEX_BUFFER_BIT,VMA_MEMORY_USAGE_CPU_TO_GPU);
        }
        upload_atlas();
    }
    ~Renderer() { cleanup(); }
    void cleanup() {
        if (device) vkDeviceWaitIdle(device);
        destroy_buffer(index); destroy_buffer(vertex);
        for (auto& buffer:overlayBuffers) destroy_buffer(buffer);
        for (int i=0;i<2;++i) {
            if (fences[i]) vkDestroyFence(device,fences[i],nullptr);
            if (finished[i]) vkDestroySemaphore(device,finished[i],nullptr);
            if (acquired[i]) vkDestroySemaphore(device,acquired[i],nullptr);
        }
        if (commandPool) vkDestroyCommandPool(device,commandPool,nullptr);
        for (auto f:framebuffers) vkDestroyFramebuffer(device,f,nullptr);
        if (pipeline) vkDestroyPipeline(device,pipeline,nullptr);
        if (uiPipeline) vkDestroyPipeline(device,uiPipeline,nullptr);
        if (pipelineLayout) vkDestroyPipelineLayout(device,pipelineLayout,nullptr);
        if (uiPipelineLayout) vkDestroyPipelineLayout(device,uiPipelineLayout,nullptr);
        if (renderPass) vkDestroyRenderPass(device,renderPass,nullptr);
        if (atlasPool) vkDestroyDescriptorPool(device,atlasPool,nullptr);
        if (atlasSampler) vkDestroySampler(device,atlasSampler,nullptr);
        if (atlasView) vkDestroyImageView(device,atlasView,nullptr);
        if (atlasImage) vmaDestroyImage(allocator,atlasImage,atlasAllocation);
        if (atlasLayout) vkDestroyDescriptorSetLayout(device,atlasLayout,nullptr);
        if (depthView) vkDestroyImageView(device,depthView,nullptr);
        if (depthImage) vmaDestroyImage(allocator,depthImage,depthAllocation);
        for (auto v:views) vkDestroyImageView(device,v,nullptr);
        if (swapchain) vkDestroySwapchainKHR(device,swapchain,nullptr);
        if (allocator) vmaDestroyAllocator(allocator);
        if (device) vkDestroyDevice(device,nullptr);
        if (surface) vkDestroySurfaceKHR(instance,surface,nullptr);
        if (debug) vkDestroyDebugUtilsMessengerEXT(instance,debug,nullptr);
        if (instance) vkDestroyInstance(instance,nullptr);
    }
    Buffer make_buffer(VkDeviceSize bytes,VkBufferUsageFlags usage,VmaMemoryUsage memory) {
        Buffer b; b.size=bytes;
        VkBufferCreateInfo info{VK_STRUCTURE_TYPE_BUFFER_CREATE_INFO}; info.size=bytes; info.usage=usage; info.sharingMode=VK_SHARING_MODE_EXCLUSIVE;
        VmaAllocationCreateInfo alloc{}; alloc.usage=memory;
        check(vmaCreateBuffer(allocator,&info,&alloc,&b.handle,&b.allocation,nullptr),"vmaCreateBuffer"); return b;
    }
    void destroy_buffer(Buffer& b) { if (b.handle) vmaDestroyBuffer(allocator,b.handle,b.allocation); b={}; }
    void upload_atlas() {
        auto pixels=read_file("assets/block_atlas.rgba");
        if (pixels.size()!=512u*768u*4u) throw std::runtime_error("Invalid block atlas size");
        Buffer staging=make_buffer(pixels.size(),VK_BUFFER_USAGE_TRANSFER_SRC_BIT,VMA_MEMORY_USAGE_CPU_ONLY);
        void* mapped=nullptr; check(vmaMapMemory(allocator,staging.allocation,&mapped),"map atlas staging");
        std::memcpy(mapped,pixels.data(),pixels.size());
        vmaFlushAllocation(allocator,staging.allocation,0,VK_WHOLE_SIZE);
        vmaUnmapMemory(allocator,staging.allocation);
        VkImageCreateInfo imageInfo{VK_STRUCTURE_TYPE_IMAGE_CREATE_INFO};
        imageInfo.imageType=VK_IMAGE_TYPE_2D; imageInfo.format=VK_FORMAT_R8G8B8A8_UNORM;
        imageInfo.extent={512,768,1}; imageInfo.mipLevels=1; imageInfo.arrayLayers=1;
        imageInfo.samples=VK_SAMPLE_COUNT_1_BIT; imageInfo.tiling=VK_IMAGE_TILING_OPTIMAL;
        imageInfo.usage=VK_IMAGE_USAGE_TRANSFER_DST_BIT|VK_IMAGE_USAGE_SAMPLED_BIT;
        VmaAllocationCreateInfo allocationInfo{}; allocationInfo.usage=VMA_MEMORY_USAGE_AUTO_PREFER_DEVICE;
        check(vmaCreateImage(allocator,&imageInfo,&allocationInfo,&atlasImage,&atlasAllocation,nullptr),"create block atlas");
        VkCommandBufferAllocateInfo allocate{VK_STRUCTURE_TYPE_COMMAND_BUFFER_ALLOCATE_INFO};
        allocate.commandPool=commandPool; allocate.level=VK_COMMAND_BUFFER_LEVEL_PRIMARY; allocate.commandBufferCount=1;
        VkCommandBuffer command; check(vkAllocateCommandBuffers(device,&allocate,&command),"atlas command");
        VkCommandBufferBeginInfo begin{VK_STRUCTURE_TYPE_COMMAND_BUFFER_BEGIN_INFO}; begin.flags=VK_COMMAND_BUFFER_USAGE_ONE_TIME_SUBMIT_BIT;
        check(vkBeginCommandBuffer(command,&begin),"begin atlas upload");
        VkImageMemoryBarrier barrier{VK_STRUCTURE_TYPE_IMAGE_MEMORY_BARRIER};
        barrier.oldLayout=VK_IMAGE_LAYOUT_UNDEFINED; barrier.newLayout=VK_IMAGE_LAYOUT_TRANSFER_DST_OPTIMAL;
        barrier.srcQueueFamilyIndex=VK_QUEUE_FAMILY_IGNORED; barrier.dstQueueFamilyIndex=VK_QUEUE_FAMILY_IGNORED;
        barrier.image=atlasImage; barrier.subresourceRange.aspectMask=VK_IMAGE_ASPECT_COLOR_BIT;
        barrier.subresourceRange.levelCount=1; barrier.subresourceRange.layerCount=1;
        barrier.dstAccessMask=VK_ACCESS_TRANSFER_WRITE_BIT;
        vkCmdPipelineBarrier(command,VK_PIPELINE_STAGE_TOP_OF_PIPE_BIT,VK_PIPELINE_STAGE_TRANSFER_BIT,0,0,nullptr,0,nullptr,1,&barrier);
        VkBufferImageCopy copy{}; copy.imageSubresource.aspectMask=VK_IMAGE_ASPECT_COLOR_BIT;
        copy.imageSubresource.layerCount=1; copy.imageExtent={512,768,1};
        vkCmdCopyBufferToImage(command,staging.handle,atlasImage,VK_IMAGE_LAYOUT_TRANSFER_DST_OPTIMAL,1,&copy);
        barrier.oldLayout=VK_IMAGE_LAYOUT_TRANSFER_DST_OPTIMAL; barrier.newLayout=VK_IMAGE_LAYOUT_SHADER_READ_ONLY_OPTIMAL;
        barrier.srcAccessMask=VK_ACCESS_TRANSFER_WRITE_BIT; barrier.dstAccessMask=VK_ACCESS_SHADER_READ_BIT;
        vkCmdPipelineBarrier(command,VK_PIPELINE_STAGE_TRANSFER_BIT,VK_PIPELINE_STAGE_FRAGMENT_SHADER_BIT,0,0,nullptr,0,nullptr,1,&barrier);
        check(vkEndCommandBuffer(command),"end atlas upload");
        VkSubmitInfo submit{VK_STRUCTURE_TYPE_SUBMIT_INFO}; submit.commandBufferCount=1; submit.pCommandBuffers=&command;
        check(vkQueueSubmit(graphics,1,&submit,VK_NULL_HANDLE),"submit atlas upload");
        check(vkQueueWaitIdle(graphics),"wait atlas upload");
        vkFreeCommandBuffers(device,commandPool,1,&command); destroy_buffer(staging);
        VkImageViewCreateInfo viewInfo{VK_STRUCTURE_TYPE_IMAGE_VIEW_CREATE_INFO};
        viewInfo.image=atlasImage; viewInfo.viewType=VK_IMAGE_VIEW_TYPE_2D; viewInfo.format=imageInfo.format;
        viewInfo.subresourceRange.aspectMask=VK_IMAGE_ASPECT_COLOR_BIT;
        viewInfo.subresourceRange.levelCount=1; viewInfo.subresourceRange.layerCount=1;
        check(vkCreateImageView(device,&viewInfo,nullptr,&atlasView),"atlas view");
        VkSamplerCreateInfo samplerInfo{VK_STRUCTURE_TYPE_SAMPLER_CREATE_INFO};
        samplerInfo.magFilter=VK_FILTER_NEAREST; samplerInfo.minFilter=VK_FILTER_NEAREST;
        samplerInfo.mipmapMode=VK_SAMPLER_MIPMAP_MODE_NEAREST;
        samplerInfo.addressModeU=VK_SAMPLER_ADDRESS_MODE_CLAMP_TO_EDGE;
        samplerInfo.addressModeV=VK_SAMPLER_ADDRESS_MODE_CLAMP_TO_EDGE;
        samplerInfo.addressModeW=VK_SAMPLER_ADDRESS_MODE_CLAMP_TO_EDGE;
        check(vkCreateSampler(device,&samplerInfo,nullptr,&atlasSampler),"atlas sampler");
        VkDescriptorPoolSize poolSize{VK_DESCRIPTOR_TYPE_COMBINED_IMAGE_SAMPLER,1};
        VkDescriptorPoolCreateInfo poolInfo{VK_STRUCTURE_TYPE_DESCRIPTOR_POOL_CREATE_INFO};
        poolInfo.maxSets=1; poolInfo.poolSizeCount=1; poolInfo.pPoolSizes=&poolSize;
        check(vkCreateDescriptorPool(device,&poolInfo,nullptr,&atlasPool),"atlas descriptor pool");
        VkDescriptorSetAllocateInfo setInfo{VK_STRUCTURE_TYPE_DESCRIPTOR_SET_ALLOCATE_INFO};
        setInfo.descriptorPool=atlasPool; setInfo.descriptorSetCount=1; setInfo.pSetLayouts=&atlasLayout;
        check(vkAllocateDescriptorSets(device,&setInfo,&atlasSet),"atlas descriptor set");
        VkDescriptorImageInfo descriptor{}; descriptor.sampler=atlasSampler; descriptor.imageView=atlasView;
        descriptor.imageLayout=VK_IMAGE_LAYOUT_SHADER_READ_ONLY_OPTIMAL;
        VkWriteDescriptorSet write{VK_STRUCTURE_TYPE_WRITE_DESCRIPTOR_SET};
        write.dstSet=atlasSet; write.descriptorCount=1; write.descriptorType=VK_DESCRIPTOR_TYPE_COMBINED_IMAGE_SAMPLER;
        write.pImageInfo=&descriptor; vkUpdateDescriptorSets(device,1,&write,0,nullptr);
    }
    void create_swapchain() {
        VkSurfaceCapabilitiesKHR cap{}; vkGetPhysicalDeviceSurfaceCapabilitiesKHR(physical,surface,&cap);
        uint32_t n=0; vkGetPhysicalDeviceSurfaceFormatsKHR(physical,surface,&n,nullptr);
        std::vector<VkSurfaceFormatKHR> formats(n); vkGetPhysicalDeviceSurfaceFormatsKHR(physical,surface,&n,formats.data());
        VkSurfaceFormatKHR chosen=formats.front();
        for (auto f:formats) if (f.format==VK_FORMAT_B8G8R8A8_SRGB && f.colorSpace==VK_COLOR_SPACE_SRGB_NONLINEAR_KHR) chosen=f;
        format=chosen.format;
        int width,height; glfwGetFramebufferSize(window,&width,&height);
        extent=cap.currentExtent.width!=UINT32_MAX ? cap.currentExtent : VkExtent2D{std::clamp(uint32_t(width),cap.minImageExtent.width,cap.maxImageExtent.width),std::clamp(uint32_t(height),cap.minImageExtent.height,cap.maxImageExtent.height)};
        uint32_t count=std::max(2u,cap.minImageCount); if (cap.maxImageCount) count=std::min(count,cap.maxImageCount);
        uint32_t families[]={graphicsFamily,presentFamily};
        VkSwapchainCreateInfoKHR sw{VK_STRUCTURE_TYPE_SWAPCHAIN_CREATE_INFO_KHR};
        sw.surface=surface; sw.minImageCount=count; sw.imageFormat=format; sw.imageColorSpace=chosen.colorSpace; sw.imageExtent=extent; sw.imageArrayLayers=1; sw.imageUsage=VK_IMAGE_USAGE_COLOR_ATTACHMENT_BIT;
        sw.imageSharingMode=graphicsFamily==presentFamily ? VK_SHARING_MODE_EXCLUSIVE : VK_SHARING_MODE_CONCURRENT;
        if (graphicsFamily!=presentFamily) { sw.queueFamilyIndexCount=2; sw.pQueueFamilyIndices=families; }
        sw.preTransform=cap.currentTransform; sw.compositeAlpha=VK_COMPOSITE_ALPHA_OPAQUE_BIT_KHR; sw.presentMode=VK_PRESENT_MODE_FIFO_KHR; sw.clipped=VK_TRUE;
        check(vkCreateSwapchainKHR(device,&sw,nullptr,&swapchain),"swapchain");
        vkGetSwapchainImagesKHR(device,swapchain,&count,nullptr); images.resize(count); vkGetSwapchainImagesKHR(device,swapchain,&count,images.data());
        imageFences.resize(count,VK_NULL_HANDLE);
        for (auto image:images) {
            VkImageViewCreateInfo v{VK_STRUCTURE_TYPE_IMAGE_VIEW_CREATE_INFO}; v.image=image; v.viewType=VK_IMAGE_VIEW_TYPE_2D; v.format=format; v.subresourceRange.aspectMask=VK_IMAGE_ASPECT_COLOR_BIT; v.subresourceRange.levelCount=1; v.subresourceRange.layerCount=1;
            VkImageView view; check(vkCreateImageView(device,&v,nullptr,&view),"swapchain image view"); views.push_back(view);
        }
        VkImageCreateInfo di{VK_STRUCTURE_TYPE_IMAGE_CREATE_INFO}; di.imageType=VK_IMAGE_TYPE_2D; di.format=VK_FORMAT_D32_SFLOAT; di.extent={extent.width,extent.height,1}; di.mipLevels=1; di.arrayLayers=1; di.samples=VK_SAMPLE_COUNT_1_BIT; di.tiling=VK_IMAGE_TILING_OPTIMAL; di.usage=VK_IMAGE_USAGE_DEPTH_STENCIL_ATTACHMENT_BIT;
        VmaAllocationCreateInfo da{}; da.usage=VMA_MEMORY_USAGE_AUTO_PREFER_DEVICE;
        check(vmaCreateImage(allocator,&di,&da,&depthImage,&depthAllocation,nullptr),"depth image");
        VkImageViewCreateInfo dv{VK_STRUCTURE_TYPE_IMAGE_VIEW_CREATE_INFO}; dv.image=depthImage; dv.viewType=VK_IMAGE_VIEW_TYPE_2D; dv.format=VK_FORMAT_D32_SFLOAT; dv.subresourceRange.aspectMask=VK_IMAGE_ASPECT_DEPTH_BIT; dv.subresourceRange.levelCount=1; dv.subresourceRange.layerCount=1;
        check(vkCreateImageView(device,&dv,nullptr,&depthView),"depth view");
        std::array<VkAttachmentDescription,2> attachments{};
        attachments[0].format=format; attachments[0].samples=VK_SAMPLE_COUNT_1_BIT; attachments[0].loadOp=VK_ATTACHMENT_LOAD_OP_CLEAR; attachments[0].storeOp=VK_ATTACHMENT_STORE_OP_STORE; attachments[0].initialLayout=VK_IMAGE_LAYOUT_UNDEFINED; attachments[0].finalLayout=VK_IMAGE_LAYOUT_PRESENT_SRC_KHR;
        attachments[1].format=VK_FORMAT_D32_SFLOAT; attachments[1].samples=VK_SAMPLE_COUNT_1_BIT; attachments[1].loadOp=VK_ATTACHMENT_LOAD_OP_CLEAR; attachments[1].storeOp=VK_ATTACHMENT_STORE_OP_DONT_CARE; attachments[1].initialLayout=VK_IMAGE_LAYOUT_UNDEFINED; attachments[1].finalLayout=VK_IMAGE_LAYOUT_DEPTH_STENCIL_ATTACHMENT_OPTIMAL;
        VkAttachmentReference color{0,VK_IMAGE_LAYOUT_COLOR_ATTACHMENT_OPTIMAL}, depth{1,VK_IMAGE_LAYOUT_DEPTH_STENCIL_ATTACHMENT_OPTIMAL};
        VkSubpassDescription sub{}; sub.pipelineBindPoint=VK_PIPELINE_BIND_POINT_GRAPHICS; sub.colorAttachmentCount=1; sub.pColorAttachments=&color; sub.pDepthStencilAttachment=&depth;
        VkSubpassDependency dependency{}; dependency.srcSubpass=VK_SUBPASS_EXTERNAL; dependency.dstSubpass=0; dependency.srcStageMask=VK_PIPELINE_STAGE_COLOR_ATTACHMENT_OUTPUT_BIT|VK_PIPELINE_STAGE_EARLY_FRAGMENT_TESTS_BIT; dependency.dstStageMask=dependency.srcStageMask; dependency.dstAccessMask=VK_ACCESS_COLOR_ATTACHMENT_WRITE_BIT|VK_ACCESS_DEPTH_STENCIL_ATTACHMENT_WRITE_BIT;
        VkRenderPassCreateInfo rp{VK_STRUCTURE_TYPE_RENDER_PASS_CREATE_INFO}; rp.attachmentCount=2; rp.pAttachments=attachments.data(); rp.subpassCount=1; rp.pSubpasses=&sub; rp.dependencyCount=1; rp.pDependencies=&dependency;
        check(vkCreateRenderPass(device,&rp,nullptr,&renderPass),"render pass");
        VkPushConstantRange push{VK_SHADER_STAGE_VERTEX_BIT,0,sizeof(glm::mat4)};
        VkPipelineLayoutCreateInfo layout{VK_STRUCTURE_TYPE_PIPELINE_LAYOUT_CREATE_INFO}; layout.pushConstantRangeCount=1; layout.pPushConstantRanges=&push;
        layout.setLayoutCount=1; layout.pSetLayouts=&atlasLayout;
        check(vkCreatePipelineLayout(device,&layout,nullptr,&pipelineLayout),"pipeline layout");
        layout.setLayoutCount=0; layout.pSetLayouts=nullptr;
        check(vkCreatePipelineLayout(device,&layout,nullptr,&uiPipelineLayout),"UI pipeline layout");
        auto vert=read_file("terrain.vert.spv"), frag=read_file("terrain.frag.spv");
        auto uiVert=read_file("ui.vert.spv"), uiFrag=read_file("ui.frag.spv");
        auto module=[&](const std::vector<char>& data) { VkShaderModuleCreateInfo sm{VK_STRUCTURE_TYPE_SHADER_MODULE_CREATE_INFO}; sm.codeSize=data.size(); sm.pCode=reinterpret_cast<const uint32_t*>(data.data()); VkShaderModule m; check(vkCreateShaderModule(device,&sm,nullptr,&m),"shader module"); return m; };
        VkShaderModule vm=module(vert), fm=module(frag);
        VkShaderModule uvm=module(uiVert), ufm=module(uiFrag);
        VkPipelineShaderStageCreateInfo stages[2]{};
        stages[0].sType=VK_STRUCTURE_TYPE_PIPELINE_SHADER_STAGE_CREATE_INFO; stages[0].stage=VK_SHADER_STAGE_VERTEX_BIT; stages[0].module=vm; stages[0].pName="main";
        stages[1].sType=VK_STRUCTURE_TYPE_PIPELINE_SHADER_STAGE_CREATE_INFO; stages[1].stage=VK_SHADER_STAGE_FRAGMENT_BIT; stages[1].module=fm; stages[1].pName="main";
        VkVertexInputBindingDescription binding{0,sizeof(Vertex),VK_VERTEX_INPUT_RATE_VERTEX};
        VkVertexInputAttributeDescription attr[4]={{0,0,VK_FORMAT_R32G32B32_SFLOAT,offsetof(Vertex,position)},{1,0,VK_FORMAT_R32G32B32_SFLOAT,offsetof(Vertex,normal)},{2,0,VK_FORMAT_R32G32B32_SFLOAT,offsetof(Vertex,color)},{3,0,VK_FORMAT_R32G32_SFLOAT,offsetof(Vertex,uv)}};
        VkPipelineVertexInputStateCreateInfo input{VK_STRUCTURE_TYPE_PIPELINE_VERTEX_INPUT_STATE_CREATE_INFO}; input.vertexBindingDescriptionCount=1; input.pVertexBindingDescriptions=&binding; input.vertexAttributeDescriptionCount=4; input.pVertexAttributeDescriptions=attr;
        VkPipelineInputAssemblyStateCreateInfo assembly{VK_STRUCTURE_TYPE_PIPELINE_INPUT_ASSEMBLY_STATE_CREATE_INFO}; assembly.topology=VK_PRIMITIVE_TOPOLOGY_TRIANGLE_LIST;
        VkPipelineViewportStateCreateInfo viewport{VK_STRUCTURE_TYPE_PIPELINE_VIEWPORT_STATE_CREATE_INFO}; viewport.viewportCount=1; viewport.scissorCount=1;
        VkPipelineRasterizationStateCreateInfo raster{VK_STRUCTURE_TYPE_PIPELINE_RASTERIZATION_STATE_CREATE_INFO}; raster.polygonMode=VK_POLYGON_MODE_FILL; raster.cullMode=VK_CULL_MODE_NONE; raster.frontFace=VK_FRONT_FACE_COUNTER_CLOCKWISE; raster.lineWidth=1;
        VkPipelineMultisampleStateCreateInfo multi{VK_STRUCTURE_TYPE_PIPELINE_MULTISAMPLE_STATE_CREATE_INFO}; multi.rasterizationSamples=VK_SAMPLE_COUNT_1_BIT;
        VkPipelineDepthStencilStateCreateInfo ds{VK_STRUCTURE_TYPE_PIPELINE_DEPTH_STENCIL_STATE_CREATE_INFO}; ds.depthTestEnable=VK_TRUE; ds.depthWriteEnable=VK_TRUE; ds.depthCompareOp=VK_COMPARE_OP_LESS;
        VkPipelineColorBlendAttachmentState blend{}; blend.colorWriteMask=VK_COLOR_COMPONENT_R_BIT|VK_COLOR_COMPONENT_G_BIT|VK_COLOR_COMPONENT_B_BIT|VK_COLOR_COMPONENT_A_BIT;
        VkPipelineColorBlendStateCreateInfo cb{VK_STRUCTURE_TYPE_PIPELINE_COLOR_BLEND_STATE_CREATE_INFO}; cb.attachmentCount=1; cb.pAttachments=&blend;
        VkDynamicState dyns[]={VK_DYNAMIC_STATE_VIEWPORT,VK_DYNAMIC_STATE_SCISSOR}; VkPipelineDynamicStateCreateInfo dyn{VK_STRUCTURE_TYPE_PIPELINE_DYNAMIC_STATE_CREATE_INFO}; dyn.dynamicStateCount=2; dyn.pDynamicStates=dyns;
        VkGraphicsPipelineCreateInfo pi{VK_STRUCTURE_TYPE_GRAPHICS_PIPELINE_CREATE_INFO}; pi.stageCount=2; pi.pStages=stages; pi.pVertexInputState=&input; pi.pInputAssemblyState=&assembly; pi.pViewportState=&viewport; pi.pRasterizationState=&raster; pi.pMultisampleState=&multi; pi.pDepthStencilState=&ds; pi.pColorBlendState=&cb; pi.pDynamicState=&dyn; pi.layout=pipelineLayout; pi.renderPass=renderPass;
        VkResult result=vkCreateGraphicsPipelines(device,VK_NULL_HANDLE,1,&pi,nullptr,&pipeline);
        if (result==VK_SUCCESS) {
            ds.depthTestEnable=VK_FALSE; ds.depthWriteEnable=VK_FALSE;
            stages[0].module=uvm; stages[1].module=ufm; pi.layout=uiPipelineLayout;
            result=vkCreateGraphicsPipelines(device,VK_NULL_HANDLE,1,&pi,nullptr,&uiPipeline);
        }
        vkDestroyShaderModule(device,vm,nullptr); vkDestroyShaderModule(device,fm,nullptr);
        vkDestroyShaderModule(device,uvm,nullptr); vkDestroyShaderModule(device,ufm,nullptr);
        check(result,"graphics pipeline");
        for (auto view:views) {
            VkImageView pair[]={view,depthView}; VkFramebufferCreateInfo fb{VK_STRUCTURE_TYPE_FRAMEBUFFER_CREATE_INFO}; fb.renderPass=renderPass; fb.attachmentCount=2; fb.pAttachments=pair; fb.width=extent.width; fb.height=extent.height; fb.layers=1;
            VkFramebuffer framebuffer; check(vkCreateFramebuffer(device,&fb,nullptr,&framebuffer),"framebuffer"); framebuffers.push_back(framebuffer);
        }
    }
    void upload(const World& world) {
        std::vector<Vertex> vertices; std::vector<uint32_t> indices;
        for (auto& [coord,chunk]:world.chunks) {
            uint32_t offset=uint32_t(vertices.size()); vertices.insert(vertices.end(),chunk.vertices.begin(),chunk.vertices.end());
            for (uint32_t index:chunk.indices) indices.push_back(offset+index);
        }
        if (indices.empty()) return;
        check(vkDeviceWaitIdle(device),"idle before mesh replacement");
        destroy_buffer(vertex); destroy_buffer(index);
        VkDeviceSize vb=vertices.size()*sizeof(Vertex), ib=indices.size()*sizeof(uint32_t);
        Buffer staging=make_buffer(vb+ib,VK_BUFFER_USAGE_TRANSFER_SRC_BIT,VMA_MEMORY_USAGE_CPU_ONLY);
        void* mapped=nullptr; check(vmaMapMemory(allocator,staging.allocation,&mapped),"map staging");
        std::memcpy(mapped,vertices.data(),size_t(vb)); std::memcpy(static_cast<char*>(mapped)+vb,indices.data(),size_t(ib));
        vmaFlushAllocation(allocator,staging.allocation,0,VK_WHOLE_SIZE); vmaUnmapMemory(allocator,staging.allocation);
        vertex=make_buffer(vb,VK_BUFFER_USAGE_TRANSFER_DST_BIT|VK_BUFFER_USAGE_VERTEX_BUFFER_BIT,VMA_MEMORY_USAGE_AUTO_PREFER_DEVICE);
        index=make_buffer(ib,VK_BUFFER_USAGE_TRANSFER_DST_BIT|VK_BUFFER_USAGE_INDEX_BUFFER_BIT,VMA_MEMORY_USAGE_AUTO_PREFER_DEVICE);
        VkCommandBufferAllocateInfo ai{VK_STRUCTURE_TYPE_COMMAND_BUFFER_ALLOCATE_INFO}; ai.commandPool=commandPool; ai.level=VK_COMMAND_BUFFER_LEVEL_PRIMARY; ai.commandBufferCount=1;
        VkCommandBuffer cmd; check(vkAllocateCommandBuffers(device,&ai,&cmd),"upload command");
        VkCommandBufferBeginInfo begin{VK_STRUCTURE_TYPE_COMMAND_BUFFER_BEGIN_INFO}; begin.flags=VK_COMMAND_BUFFER_USAGE_ONE_TIME_SUBMIT_BIT; check(vkBeginCommandBuffer(cmd,&begin),"begin upload");
        VkBufferCopy vc{0,0,vb}, ic{vb,0,ib}; vkCmdCopyBuffer(cmd,staging.handle,vertex.handle,1,&vc); vkCmdCopyBuffer(cmd,staging.handle,index.handle,1,&ic);
        check(vkEndCommandBuffer(cmd),"end upload"); VkSubmitInfo submit{VK_STRUCTURE_TYPE_SUBMIT_INFO}; submit.commandBufferCount=1; submit.pCommandBuffers=&cmd;
        check(vkQueueSubmit(graphics,1,&submit,VK_NULL_HANDLE),"submit upload"); check(vkQueueWaitIdle(graphics),"wait upload");
        vkFreeCommandBuffers(device,commandPool,1,&cmd); destroy_buffer(staging); indexCount=uint32_t(indices.size());
    }
    void draw(const glm::mat4& camera,const std::vector<Vertex>& overlay) {
        check(vkWaitForFences(device,1,&fences[frame],VK_TRUE,UINT64_MAX),"wait frame");
        if (overlay.size()*sizeof(Vertex)>overlayBuffers[frame].size) throw std::runtime_error("Overlay buffer full");
        void* mapped=nullptr; check(vmaMapMemory(allocator,overlayBuffers[frame].allocation,&mapped),"map overlay");
        std::memcpy(mapped,overlay.data(),overlay.size()*sizeof(Vertex));
        vmaFlushAllocation(allocator,overlayBuffers[frame].allocation,0,overlay.size()*sizeof(Vertex));
        vmaUnmapMemory(allocator,overlayBuffers[frame].allocation);
        uint32_t image=0; VkResult result=vkAcquireNextImageKHR(device,swapchain,UINT64_MAX,acquired[frame],VK_NULL_HANDLE,&image);
        if (result!=VK_SUCCESS && result!=VK_SUBOPTIMAL_KHR) check(result,"acquire image");
        if (imageFences[image]) check(vkWaitForFences(device,1,&imageFences[image],VK_TRUE,UINT64_MAX),"wait image");
        imageFences[image]=fences[frame]; check(vkResetFences(device,1,&fences[frame]),"reset fence");
        VkCommandBuffer cmd=commands[frame]; check(vkResetCommandBuffer(cmd,0),"reset command");
        VkCommandBufferBeginInfo begin{VK_STRUCTURE_TYPE_COMMAND_BUFFER_BEGIN_INFO}; check(vkBeginCommandBuffer(cmd,&begin),"begin frame");
        VkClearValue clear[2]{}; clear[0].color={{.53f,.72f,.91f,1.f}}; clear[1].depthStencil={1,0};
        VkRenderPassBeginInfo rp{VK_STRUCTURE_TYPE_RENDER_PASS_BEGIN_INFO}; rp.renderPass=renderPass; rp.framebuffer=framebuffers[image]; rp.renderArea.extent=extent; rp.clearValueCount=2; rp.pClearValues=clear;
        vkCmdBeginRenderPass(cmd,&rp,VK_SUBPASS_CONTENTS_INLINE);
        VkViewport viewport{0,0,float(extent.width),float(extent.height),0,1}; VkRect2D scissor{{0,0},extent};
        vkCmdSetViewport(cmd,0,1,&viewport); vkCmdSetScissor(cmd,0,1,&scissor);
        if (indexCount) {
            VkDeviceSize offset=0; vkCmdBindPipeline(cmd,VK_PIPELINE_BIND_POINT_GRAPHICS,pipeline); vkCmdBindVertexBuffers(cmd,0,1,&vertex.handle,&offset); vkCmdBindIndexBuffer(cmd,index.handle,0,VK_INDEX_TYPE_UINT32);
            vkCmdBindDescriptorSets(cmd,VK_PIPELINE_BIND_POINT_GRAPHICS,pipelineLayout,0,1,&atlasSet,0,nullptr);
            vkCmdPushConstants(cmd,pipelineLayout,VK_SHADER_STAGE_VERTEX_BIT,0,sizeof(glm::mat4),&camera[0][0]); vkCmdDrawIndexed(cmd,indexCount,1,0,0,0);
        }
        if (!overlay.empty()) {
            VkDeviceSize offset=0; glm::mat4 identity(1.f);
            vkCmdBindPipeline(cmd,VK_PIPELINE_BIND_POINT_GRAPHICS,uiPipeline);
            vkCmdBindVertexBuffers(cmd,0,1,&overlayBuffers[frame].handle,&offset);
            vkCmdPushConstants(cmd,uiPipelineLayout,VK_SHADER_STAGE_VERTEX_BIT,0,sizeof(glm::mat4),&identity[0][0]);
            vkCmdDraw(cmd,uint32_t(overlay.size()),1,0,0);
        }
        vkCmdEndRenderPass(cmd); check(vkEndCommandBuffer(cmd),"end frame");
        VkPipelineStageFlags wait=VK_PIPELINE_STAGE_COLOR_ATTACHMENT_OUTPUT_BIT;
        VkSubmitInfo submit{VK_STRUCTURE_TYPE_SUBMIT_INFO}; submit.waitSemaphoreCount=1; submit.pWaitSemaphores=&acquired[frame]; submit.pWaitDstStageMask=&wait; submit.commandBufferCount=1; submit.pCommandBuffers=&cmd; submit.signalSemaphoreCount=1; submit.pSignalSemaphores=&finished[frame];
        check(vkQueueSubmit(graphics,1,&submit,fences[frame]),"submit frame");
        VkPresentInfoKHR presentInfo{VK_STRUCTURE_TYPE_PRESENT_INFO_KHR}; presentInfo.waitSemaphoreCount=1; presentInfo.pWaitSemaphores=&finished[frame]; presentInfo.swapchainCount=1; presentInfo.pSwapchains=&swapchain; presentInfo.pImageIndices=&image;
        result=vkQueuePresentKHR(present,&presentInfo); if (result!=VK_SUCCESS && result!=VK_SUBOPTIMAL_KHR) check(result,"present");
        frame=(frame+1)%2;
    }
};
bool collides(const World& world,glm::vec3 feet) {
    for (float x:{-.28f,.28f}) for (float z:{-.28f,.28f}) for (float y:{.05f,.9f,1.75f}) {
        glm::ivec3 p=glm::floor(feet+glm::vec3(x,y,z)); if (world.get(p.x,p.y,p.z)!=Air) return true;
    }
    return false;
}
}
int main(int argc,char** argv) {
    try {
        if (argc>0) std::filesystem::current_path(std::filesystem::absolute(argv[0]).parent_path());
        if (!glfwInit()) throw std::runtime_error("GLFW init failed");
        if (!glfwVulkanSupported()) throw std::runtime_error("Vulkan loader unavailable");
        glfwWindowHint(GLFW_CLIENT_API,GLFW_NO_API); glfwWindowHint(GLFW_RESIZABLE,GLFW_FALSE);
        GLFWwindow* window=glfwCreateWindow(1280,720,"Stonefield",nullptr,nullptr);
        if (!window) throw std::runtime_error("Window creation failed");
        MouseButtons mouse;
        glfwSetWindowUserPointer(window,&mouse);
        glfwSetMouseButtonCallback(window,[](GLFWwindow* w,int button,int action,int) {
            if (action!=GLFW_PRESS) return;
            auto* buttons=static_cast<MouseButtons*>(glfwGetWindowUserPointer(w));
            if (button==GLFW_MOUSE_BUTTON_LEFT) buttons->leftPressed=true;
            if (button==GLFW_MOUSE_BUTTON_RIGHT) buttons->rightPressed=true;
        });
        glfwSetInputMode(window,GLFW_CURSOR,GLFW_CURSOR_NORMAL);
        World world;
        for (int z=-2;z<=2;++z) for (int x=-2;x<=2;++x) world.ensure(x,z);
        for (auto& [coord,chunk]:world.chunks) world.mesh(coord.first,coord.second);
        {
        Renderer renderer(window); renderer.upload(world);
        glm::vec3 feet{.5f,100.f,.5f};
        for (int y=100;y>=0;--y) if (world.get(0,y,0)!=Air) { feet.y=float(y+1); break; }
        float yaw=-90.f,pitch=0,vertical=0; bool grounded=false;
        double oldX=0,oldY=0; glfwGetCursorPos(window,&oldX,&oldY);
        bool oldSave=false;
        std::vector<std::string> names(1);
        {
            std::ifstream catalog("assets/blocks.tsv");
            std::string line; std::getline(catalog,line);
            while (std::getline(catalog,line)) {
                if (line.starts_with("0\t")) continue;
                size_t first=line.find('\t'), second=line.find('\t',first+1);
                if (first!=std::string::npos && second!=std::string::npos) names.push_back(line.substr(first+11,second-first-11));
            }
        }
        if (names.size()<7) throw std::runtime_error("Missing assets/blocks.tsv");
        int selected=1; std::vector<int> inventory(names.size(),64); inventory[0]=0;
        {
            std::ifstream in("stonefield.inventory",std::ios::binary);
            std::vector<int> saved(inventory.size());
            if (in.read(reinterpret_cast<char*>(saved.data()),saved.size()*sizeof(int))) inventory=std::move(saved);
            else { in.clear(); in.seekg(0); std::array<int,7> old{}; if (in.read(reinterpret_cast<char*>(old.data()),old.size()*sizeof(int))) std::copy(old.begin(),old.end(),inventory.begin()); }
        }
        auto save_game=[&] {
            world.save();
            std::ofstream out("stonefield.inventory",std::ios::binary|std::ios::trunc);
            out.write(reinterpret_cast<const char*>(inventory.data()),inventory.size()*sizeof(int));
        };
        enum class Screen { Title, Playing, Inventory, Paused, Help };
        Screen screen=Screen::Title, helpReturn=Screen::Title;
        bool oldE=false,oldEscape=false,oldPageUp=false,oldPageDown=false;
        auto show=[&](Screen next) {
            screen=next;
            glfwSetInputMode(window,GLFW_CURSOR,screen==Screen::Playing ? GLFW_CURSOR_DISABLED : GLFW_CURSOR_NORMAL);
            glfwGetCursorPos(window,&oldX,&oldY);
        };
        int page=0;
        auto last=std::chrono::steady_clock::now();
        while (!glfwWindowShouldClose(window)) {
            glfwPollEvents();
            bool escape=glfwGetKey(window,GLFW_KEY_ESCAPE)==GLFW_PRESS;
            if (escape&&!oldEscape) {
                if (screen==Screen::Playing) show(Screen::Paused);
                else if (screen==Screen::Inventory||screen==Screen::Paused) show(Screen::Playing);
                else if (screen==Screen::Help) show(helpReturn);
                else glfwSetWindowShouldClose(window,1);
            }
            oldEscape=escape;
            bool e=glfwGetKey(window,GLFW_KEY_E)==GLFW_PRESS;
            if (e&&!oldE) {
                if (screen==Screen::Playing) { page=(selected-1)/30; show(Screen::Inventory); }
                else if (screen==Screen::Inventory) show(Screen::Playing);
            }
            oldE=e;
            bool pageUp=glfwGetKey(window,GLFW_KEY_PAGE_UP)==GLFW_PRESS;
            bool pageDown=glfwGetKey(window,GLFW_KEY_PAGE_DOWN)==GLFW_PRESS;
            int pages=int((names.size()-2)/30)+1;
            if (screen==Screen::Inventory&&pageUp&&!oldPageUp) page=(page+pages-1)%pages;
            if (screen==Screen::Inventory&&pageDown&&!oldPageDown) page=(page+1)%pages;
            oldPageUp=pageUp; oldPageDown=pageDown;
            auto now=std::chrono::steady_clock::now(); float dt=std::min(.05f,std::chrono::duration<float>(now-last).count()); last=now;
            double mx,my; glfwGetCursorPos(window,&mx,&my);
            if (screen==Screen::Playing) { yaw+=float(mx-oldX)*.12f; pitch=std::clamp(pitch-float(my-oldY)*.12f,-89.f,89.f); }
            oldX=mx; oldY=my;
            glm::vec3 forward{std::cos(glm::radians(yaw))*std::cos(glm::radians(pitch)),std::sin(glm::radians(pitch)),std::sin(glm::radians(yaw))*std::cos(glm::radians(pitch))};
            glm::vec3 flat=glm::normalize(glm::vec3(forward.x,0,forward.z)); glm::vec3 right=glm::normalize(glm::cross(flat,glm::vec3(0,1,0)));
            glm::vec3 motion{};
            if (screen==Screen::Playing&&glfwGetKey(window,GLFW_KEY_W)==GLFW_PRESS) motion+=flat;
            if (screen==Screen::Playing&&glfwGetKey(window,GLFW_KEY_S)==GLFW_PRESS) motion-=flat;
            if (screen==Screen::Playing&&glfwGetKey(window,GLFW_KEY_D)==GLFW_PRESS) motion+=right;
            if (screen==Screen::Playing&&glfwGetKey(window,GLFW_KEY_A)==GLFW_PRESS) motion-=right;
            if (glm::length(motion)>0) motion=glm::normalize(motion)*5.f*dt;
            for (int axis:{0,2}) { glm::vec3 next=feet; next[axis]+=motion[axis]; if (!collides(world,next)) feet=next; }
            if (screen==Screen::Playing) {
                if (grounded && glfwGetKey(window,GLFW_KEY_SPACE)==GLFW_PRESS) { vertical=7.f; grounded=false; }
                vertical-=20.f*dt; float dy=vertical*dt; grounded=false;
                int steps=std::max(1,int(std::ceil(std::abs(dy)/.2f)));
                for (int i=0;i<steps;++i) { glm::vec3 next=feet; next.y+=dy/steps; if (collides(world,next)) { if (vertical<0) grounded=true; vertical=0; break; } feet=next; }
            }
            int cx=int(std::floor(feet.x/CHUNK_SIZE)), cz=int(std::floor(feet.z/CHUNK_SIZE));
            for (int z=cz-2;z<=cz+2;++z) for (int x=cx-2;x<=cx+2;++x) world.ensure(x,z);
            int hotbarStart=((selected-1)/9)*9+1;
            if (screen==Screen::Playing) for (int key=GLFW_KEY_1;key<=GLFW_KEY_9;++key) {
                int choice=hotbarStart+key-GLFW_KEY_1;
                if (choice<int(names.size())&&glfwGetKey(window,key)==GLFW_PRESS) selected=choice;
            }
            static bool oldPrevious=false,oldNext=false;
            bool previous=glfwGetKey(window,GLFW_KEY_LEFT_BRACKET)==GLFW_PRESS;
            bool next=glfwGetKey(window,GLFW_KEY_RIGHT_BRACKET)==GLFW_PRESS;
            if (screen==Screen::Playing&&previous&&!oldPrevious) selected=selected>1 ? selected-1 : int(names.size())-1;
            if (screen==Screen::Playing&&next&&!oldNext) selected=selected+1<int(names.size()) ? selected+1 : 1;
            oldPrevious=previous; oldNext=next;
            bool left=mouse.leftPressed, rightClick=mouse.rightPressed;
            mouse.leftPressed=false; mouse.rightPressed=false;
            int windowWidth,windowHeight; glfwGetWindowSize(window,&windowWidth,&windowHeight);
            double uiX=mx*1280/windowWidth, uiY=my*720/windowHeight;
            bool menuAction=false;
            if (left) {
                auto button=[&](int y) { return uiX>=440&&uiX<840&&uiY>=y&&uiY<y+54; };
                if (screen==Screen::Title) {
                    if (button(320)) { show(Screen::Playing); menuAction=true; }
                    else if (button(390)) { helpReturn=Screen::Title; show(Screen::Help); }
                    else if (button(460)) glfwSetWindowShouldClose(window,1);
                } else if (screen==Screen::Paused) {
                    if (button(240)) { show(Screen::Playing); menuAction=true; }
                    else if (button(310)) save_game();
                    else if (button(380)) { helpReturn=Screen::Paused; show(Screen::Help); }
                    else if (button(450)) { save_game(); show(Screen::Title); }
                } else if (screen==Screen::Help && button(540)) show(helpReturn);
            }
            if (menuAction) glfwGetCursorPos(window,&oldX,&oldY);
            if (screen==Screen::Inventory&&left&&uiY>=100&&uiY<140) {
                if (uiX>=950&&uiX<1015) page=(page+pages-1)%pages;
                if (uiX>=1020&&uiX<1090) page=(page+1)%pages;
            }
            if (screen==Screen::Inventory&&left&&uiX>=190&&uiX<1060&&uiY>=155&&uiY<575) {
                int col=int((uiX-190)/145), row=int((uiY-155)/84);
                int choice=page*30+row*6+col+1;
                if (col<6&&row<5&&choice<int(names.size())) selected=choice;
            }
            Hit hit=raycast(world,feet+glm::vec3(0,1.62f,0),forward,6.f);
            if (screen==Screen::Playing&&!menuAction&&left && hit.found) {
                uint16_t mined=world.get(hit.block.x,hit.block.y,hit.block.z);
                if (mined<inventory.size()) ++inventory[mined];
                world.set(hit.block.x,hit.block.y,hit.block.z,Air);
            }
            if (screen==Screen::Playing&&rightClick && hit.found && inventory[selected]>0) {
                glm::ivec3 p=hit.adjacent; uint16_t old=world.get(p.x,p.y,p.z); world.set(p.x,p.y,p.z,uint16_t(selected));
                if (collides(world,feet)) world.set(p.x,p.y,p.z,old); else --inventory[selected];
            }
            bool save=glfwGetKey(window,GLFW_KEY_F5)==GLFW_PRESS; if (save&&!oldSave) save_game(); oldSave=save;
            bool dirty=false; for (auto& [coord,chunk]:world.chunks) if (chunk.dirty) { world.mesh(coord.first,coord.second); dirty=true; }
            if (dirty) renderer.upload(world);
            Overlay overlay;
            if (screen==Screen::Playing||screen==Screen::Inventory||screen==Screen::Paused) {
                overlay.tile_rect(240,626,800,82,0,.03f);
                hotbarStart=((selected-1)/9)*9+1;
                for (int slot=0;slot<9;++slot) {
                    int id=hotbarStart+slot, x=250+slot*86;
                    if (id>=int(names.size())) break;
                    overlay.tile_rect(float(x),635,78,62,id==selected ? 7 : 1,.02f);
                    overlay.tile_rect(float(x+3),638,72,56,2,.015f);
                    overlay.block_icon(float(x+9),646,28,id,.01f);
                    overlay.text(float(x+43),648,std::to_string(inventory[id]),{1,1,1},1.2f,.006f);
                    overlay.text(float(x+9),679,std::to_string(slot+1),{1,1,1},1.1f,.006f);
                }
            }
            if (screen==Screen::Inventory) {
                overlay.tile_rect(150,85,980,520,0,.03f);
                overlay.text(183,104,"BLOCK INVENTORY",{1,1,1},2.f,.006f);
                overlay.text(771,109,"PAGE "+std::to_string(page+1)+" / "+std::to_string(pages),{.9f,.9f,.7f},1.5f,.006f);
                overlay.tile_rect(950,100,65,40,4,.02f);
                overlay.tile_rect(1020,100,70,40,4,.02f);
                overlay.text(956,112,"PREV",{1,1,1},1.3f,.006f);
                overlay.text(1027,112,"NEXT",{1,1,1},1.3f,.006f);
                for (int slot=0;slot<30;++slot) {
                    int id=page*30+slot+1;
                    if (id>=int(names.size())) break;
                    int x=190+(slot%6)*145, y=155+(slot/6)*84;
                    overlay.tile_rect(float(x),float(y),138,76,id==selected ? 7 : 1,.02f);
                    overlay.tile_rect(float(x+3),float(y+3),132,70,2,.015f);
                    overlay.block_icon(float(x+8),float(y+9),29,id,.01f);
                    overlay.text(float(x+44),float(y+14),std::to_string(inventory[id]),{1,1,1},1.4f,.006f);
                    overlay.text(float(x+8),float(y+50),names[id].substr(0,14),{1,1,1},1.35f,.006f);
                }
                overlay.text(190,583,"CLICK SELECT    PREV / NEXT PAGE    E CLOSE",{1,1,1},1.4f,.006f);
            } else if (screen==Screen::Playing) {
                overlay.rect(637,349,6,22,{1,1,1},.01f);
                overlay.rect(629,357,22,6,{1,1,1},.009f);
                overlay.text(16,16,names[selected]+"  x"+std::to_string(inventory[selected]),{1,1,1},1.4f,.006f);
                overlay.text(1090,16,"ESC  MENU",{1,1,1},1.2f,.006f);
            }
            auto menuButton=[&](int y,const std::string& label,bool primary) {
                bool hover=uiX>=440&&uiX<840&&uiY>=y&&uiY<y+54;
                overlay.tile_rect(440,float(y+5),400,54,9,.025f);
                overlay.tile_rect(440,float(y),400,54,1,.02f);
                overlay.tile_rect(445,float(y+4),390,44,hover ? 7 : (primary ? 3 : 4),.015f);
                overlay.text(465,float(y+16),label,{.08f,.10f,.08f},2.f,.006f);
            };
            if (screen==Screen::Title) {
                overlay.tile_rect(320,100,640,500,0,.03f);
                overlay.tile_rect(330,110,620,165,6,.02f);
                overlay.tile_rect(352,138,72,72,3,.01f);
                overlay.tile_rect(360,174,64,36,5,.008f);
                overlay.text(448,139,"STONEFIELD",{1,1,1},4.4f,.006f);
                overlay.text(453,210,"AN ORIGINAL VOXEL SANDBOX",{.87f,.92f,.83f},1.9f,.006f);
                menuButton(320,"PLAY WORLD",true);
                menuButton(390,"CONTROLS",false);
                menuButton(460,"QUIT",false);
                overlay.text(425,561,"WASD MOVE   E INVENTORY   ESC PAUSE",{.78f,.83f,.76f},1.4f,.006f);
            } else if (screen==Screen::Paused) {
                overlay.tile_rect(390,105,500,475,0,.03f);
                overlay.tile_rect(405,120,470,95,6,.02f);
                overlay.text(457,150,"PAUSED",{1,1,1},4.f,.006f);
                menuButton(240,"RESUME",true);
                menuButton(310,"SAVE WORLD",false);
                menuButton(380,"CONTROLS",false);
                menuButton(450,"MAIN MENU",false);
            } else if (screen==Screen::Help) {
                overlay.tile_rect(320,90,640,525,0,.03f);
                overlay.tile_rect(335,105,610,80,6,.02f);
                overlay.text(405,129,"CONTROLS",{1,1,1},3.6f,.006f);
                const char* controls[]={"W A S D     MOVE","MOUSE       LOOK","SPACE       JUMP","LEFT CLICK  MINE BLOCK","RIGHT CLICK PLACE BLOCK","E           INVENTORY","1 - 9       HOTBAR","F5          SAVE WORLD","ESC         PAUSE / BACK"};
                for (int i=0;i<9;++i) overlay.text(385,float(205+i*32),controls[i],{.94f,.94f,.87f},2.1f,.006f);
                menuButton(540,"BACK",true);
            }
            glfwSetWindowTitle(window,"Stonefield");
            glm::mat4 view=glm::lookAt(feet+glm::vec3(0,1.62f,0),feet+glm::vec3(0,1.62f,0)+forward,glm::vec3(0,1,0));
            glm::mat4 projection=glm::perspective(glm::radians(75.f),float(renderer.extent.width)/renderer.extent.height,.05f,500.f); projection[1][1]*=-1;
            renderer.draw(projection*view,overlay.vertices);
        }
        save_game();
        }
        glfwDestroyWindow(window); glfwTerminate();
    } catch (const std::exception& error) { std::cerr << "Stonefield: " << error.what() << '\n'; return 1; }
}

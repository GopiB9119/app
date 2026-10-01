-keepattributes Signature,RuntimeVisibleAnnotations,AnnotationDefault
# Gson reads and writes every transfer object by field name, in every feature.
-keep class com.community.platform.feature.**.*Dto { *; }
# The stored session keeps its field names, so a later build can still read it.
-keepclassmembers class com.community.platform.feature.identity.Credentials { <fields>; }

# R8 full mode rules that Retrofit 2.10 and later ship and 2.9.0 lacks. Without them R8 strips the generic type of
# a suspend method's Continuation, so Retrofit cannot find the response type and every API call fails before it is sent.
-keep,allowobfuscation,allowshrinking class kotlin.coroutines.Continuation
-keep,allowobfuscation,allowshrinking interface retrofit2.Call
-keep,allowobfuscation,allowshrinking class retrofit2.Response
-if interface * { @retrofit2.http.* public *** *(...); }
-keep,allowoptimization,allowshrinking,allowobfuscation class <3>
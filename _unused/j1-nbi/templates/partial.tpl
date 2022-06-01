{#
Outputs an HTML partial for embedding in other pages. Like the plain.tpl
template but also loads the j1-nbi library.
#}

{%- extends 'plain.tpl' -%}

{% block body %}
{{ super() }}

{% block j1-nbi_script %}
<!-- Loads j1-nbi package -->
<script src="https://unpkg.com/j1-nbi-core" async></script>
<script>
  (function setupj1-nbi() {
    // If j1-nbi hasn't loaded, wait one second and try again
    if (window.j1-nbi === undefined) {
      setTimeout(setupj1-nbi, 1000)
      return
    }

    var interact = new window.j1-nbi({
      spec: '{{ spec }}',
      baseUrl: '{{ base_url }}',
      provider: '{{ provider }}',
    })
    interact.prepare()

    window.interact = interact
  })()
</script>
{%- endblock j1-nbi_script %}

{%- endblock body %}

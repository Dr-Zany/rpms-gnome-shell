FROM registry.fedoraproject.org/fedora:44

RUN dnf -y install \
        fedpkg \
        make \
        rpm-build \
        rpmdevtools \
        python3-rpmautospec \
        dnf5-plugins \
        shadow-utils \
    && dnf clean all

# Cache build dependencies until the spec changes. Resolve %autorelease without
# needing the checkout's Git history during image construction. Accept the
# spec's -e suffix argument so it is not left in the Release field.
COPY gnome-shell.spec /tmp/gnome-shell.spec
RUN dnf -y builddep --define 'autorelease(e:) 1' /tmp/gnome-shell.spec \
    && dnf clean all

RUN useradd --create-home --uid 1000 builder
USER builder
WORKDIR /workspace

CMD ["make"]
